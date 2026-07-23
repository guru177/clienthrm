use actix_multipart::Multipart;
use actix_web::error::{ErrorUnauthorized, Error};
use actix_web::{web, HttpRequest, HttpResponse};
use actix_ws::Message;
use futures_util::StreamExt;
use crate::db::OptionalExt;
use std::sync::Arc;

use crate::chat_events::ChatEvents;
use crate::db::DbPool;
use crate::middleware::auth::{decode_tenant_token, get_claims_from_request};
use crate::models::chat::{
    AddMembersBody, ChatMember, ChatMessage, ChatReaction, ChatSpace, CreateChannelBody,
    CreateDmBody, EditMessageBody, ReactionBody, SendMessageBody, UpdateChannelBody,
};
use crate::models::user::JwtClaims;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::{chat_space_in_organization, org_id_from_claims, user_in_organization};

fn now_ts() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn dm_hash(user_ids: &[i64]) -> String {
    let mut ids = user_ids.to_vec();
    ids.sort_unstable();
    ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",")
}

fn ws_token_from_query(req: &HttpRequest, jwt_secret: &str) -> Result<JwtClaims, Error> {
    let token = req
        .uri()
        .query()
        .and_then(|q| {
            q.split('&').find_map(|pair| {
                let mut parts = pair.splitn(2, '=');
                if parts.next()? == "token" {
                    parts.next()
                } else {
                    None
                }
            })
        })
        .ok_or_else(|| ErrorUnauthorized("Missing token query parameter"))?;

    decode_tenant_token(token, jwt_secret).map_err(|e| ErrorUnauthorized(e.to_string()))
}

fn user_is_member(conn: &crate::db::Connection, space_id: i64, user_id: i64) -> bool {
    conn.query_row(
        "SELECT 1 FROM chat_space_members WHERE space_id = ?1 AND user_id = ?2",
        crate::params![space_id, user_id],
        |_| Ok(()),
    )
    .optional()
    .ok()
    .flatten()
    .is_some()
}

fn ensure_space_access(
    conn: &crate::db::Connection,
    space_id: i64,
    org_id: i64,
    user_id: i64,
) -> Option<HttpResponse> {
    if !chat_space_in_organization(conn, space_id, org_id) {
        return Some(HttpResponse::NotFound().json(ApiError::new("Channel not found")));
    }
    if !user_is_member(conn, space_id, user_id) {
        return Some(HttpResponse::Forbidden().json(ApiError::new("Not a member of this channel")));
    }
    None
}

fn ensure_general_channel(conn: &crate::db::Connection, org_id: i64, user_id: i64) -> crate::db::Result<i64> {
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM chat_spaces WHERE organization_id = ?1 AND kind = 'channel' AND slug = 'general'",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .optional()?
    {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO chat_space_members (space_id, user_id, role, joined_at) VALUES (?1, ?2, 'member', ?3)",
            crate::params![id, user_id, now_ts()],
        );
        return Ok(id);
    }

    let now = now_ts();
    conn.execute(
        "INSERT INTO chat_spaces (organization_id, kind, name, slug, description, is_private, created_by, created_at, updated_at)
         VALUES (?1, 'channel', 'general', 'general', 'Company-wide announcements and team chat', 0, ?2, ?3, ?3)",
        crate::params![org_id, user_id, &now],
    )?;
    let space_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO chat_space_members (space_id, user_id, role, joined_at) VALUES (?1, ?2, 'admin', ?3)",
        crate::params![space_id, user_id, &now],
    )?;
    Ok(space_id)
}

fn load_space_row(
    conn: &crate::db::Connection,
    space_id: i64,
    org_id: i64,
    viewer_id: i64,
) -> Option<ChatSpace> {
    conn.query_row(
        "SELECT s.id, s.organization_id, s.kind, s.name, s.slug, s.description, s.topic, s.is_private,
                s.department_id, s.created_by, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM chat_space_members m WHERE m.space_id = s.id) AS member_count,
                (SELECT COUNT(*) FROM chat_messages msg
                 WHERE msg.space_id = s.id AND msg.is_deleted = 0
                   AND msg.created_at > COALESCE(
                     (SELECT last_read_at FROM chat_space_members WHERE space_id = s.id AND user_id = ?3),
                     '1970-01-01'
                   )
                   AND msg.user_id != ?3) AS unread_count,
                (SELECT created_at FROM chat_messages WHERE space_id = s.id AND parent_id IS NULL AND is_deleted = 0 ORDER BY id DESC LIMIT 1) AS last_message_at,
                (SELECT substr(content, 1, 80) FROM chat_messages WHERE space_id = s.id AND parent_id IS NULL AND is_deleted = 0 ORDER BY id DESC LIMIT 1) AS last_message_preview
         FROM chat_spaces s
         WHERE s.id = ?1 AND s.organization_id = ?2",
        crate::params![space_id, org_id, viewer_id],
        |row| {
            Ok(ChatSpace {
                id: row.get_idx::<i64>(0)?,
                organization_id: row.get_idx::<i64>(1)?,
                kind: row.get_idx::<String>(2)?,
                name: row.get_idx::<Option<String>>(3)?,
                slug: row.get_idx::<Option<String>>(4)?,
                description: row.get_idx::<Option<String>>(5)?,
                topic: row.get_idx::<Option<String>>(6)?,
                is_private: row.get_idx::<i64>(7)? != 0,
                department_id: row.get_idx::<Option<i64>>(8)?,
                created_by: row.get_idx::<Option<i64>>(9)?,
                created_at: row.get_idx::<String>(10)?,
                updated_at: row.get_idx::<String>(11)?,
                member_count: row.get_idx::<i64>(12)?,
                unread_count: row.get_idx::<i64>(13)?,
                last_message_at: row.get_idx::<Option<String>>(14)?,
                last_message_preview: row.get_idx::<Option<String>>(15)?,
                dm_members: None,
            })
        },
    )
    .optional()
    .ok()
    .flatten()
}

fn load_dm_members(conn: &crate::db::Connection, space_id: i64, viewer_id: i64) -> Vec<ChatMember> {
    let cutoff = chrono::Utc::now() - chrono::Duration::minutes(15);
    let cutoff_str = cutoff.format("%Y-%m-%d %H:%M:%S").to_string();
    let stmt = match conn.prepare(
        "SELECT u.id, u.name, u.email, u.photo,
                CASE WHEN p.last_active_at >= ?3 THEN 1 ELSE 0 END AS is_online
         FROM chat_space_members m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN user_presence p ON p.user_id = u.id
         WHERE m.space_id = ?1 AND m.user_id != ?2
         ORDER BY u.name",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map(crate::params![space_id, viewer_id, cutoff_str], |row| {
        Ok(ChatMember {
            user_id: row.get_idx::<i64>(0)?,
            name: row.get_idx::<String>(1)?,
            email: row.get_idx::<String>(2)?,
            photo: row.get_idx::<Option<String>>(3)?,
            is_online: row.get_idx::<i64>(4)? != 0,
        })
    })
}

fn build_reactions_json(
    conn: &crate::db::Connection,
    message_id: i64,
    viewer_id: i64,
) -> String {
    let stmt = match conn.prepare(
        "SELECT emoji, GROUP_CONCAT(user_id) FROM chat_message_reactions WHERE message_id = ?1 GROUP BY emoji",
    ) {
        Ok(s) => s,
        Err(_) => return "[]".to_string(),
    };
    let reactions: Vec<ChatReaction> = stmt
        .query_map([message_id], |row| {
            let emoji: String = row.get_idx::<String>(0)?;
            let ids_raw: Option<String> = row.get_idx::<Option<String>>(1)?;
            let user_ids: Vec<i64> = ids_raw
                .unwrap_or_default()
                .split(',')
                .filter_map(|s| s.parse().ok())
                .collect();
            let count = user_ids.len() as i64;
            let reacted_by_me = user_ids.contains(&viewer_id);
            Ok(ChatReaction {
                emoji,
                count,
                user_ids,
                reacted_by_me,
            })
        });
    serde_json::to_string(&reactions).unwrap_or_else(|_| "[]".to_string())
}

fn build_attachments_json(conn: &crate::db::Connection, message_id: i64) -> String {
    let stmt = match conn.prepare(
        "SELECT id, file_name, file_url, file_size, mime_type FROM chat_message_attachments WHERE message_id = ?1",
    ) {
        Ok(s) => s,
        Err(_) => return "[]".to_string(),
    };
    let items: Vec<serde_json::Value> = stmt
        .query_map([message_id], |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "file_name": row.get_idx::<String>(1)?,
                "file_url": row.get_idx::<String>(2)?,
                "file_size": row.get_idx::<i64>(3)?,
                "mime_type": row.get_idx::<Option<String>>(4)?,
            }))
        });
    serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string())
}

fn batch_reactions_for_messages(
    conn: &crate::db::Connection,
    message_ids: &[i64],
    viewer_id: i64,
) -> std::collections::HashMap<i64, Vec<ChatReaction>> {
    use std::collections::HashMap;
    if message_ids.is_empty() {
        return HashMap::new();
    }
    let placeholders = message_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT r.message_id, r.emoji, GROUP_CONCAT(r.user_id)
         FROM chat_message_reactions r
         WHERE r.message_id IN ({placeholders})
         GROUP BY r.message_id, r.emoji"
    );
    let params: Vec<crate::db::ParamValue> = message_ids
        .iter()
        .map(|id| crate::db::into_param_value(*id))
        .collect();
    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return HashMap::new(),
    };
    let mut by_message: HashMap<i64, HashMap<String, Vec<i64>>> = HashMap::new();
    let rows = stmt.query_map(crate::db::Params::from_values(params), |row| {
        Ok((
            row.get_idx::<i64>(0)?,
            row.get_idx::<String>(1)?,
            row.get_idx::<Option<String>>(2)?,
        ))
    });
    for row in rows {
        let (message_id, emoji, ids_raw) = row;
        let user_ids: Vec<i64> = ids_raw
            .unwrap_or_default()
            .split(',')
            .filter_map(|s| s.parse().ok())
            .collect();
        by_message
            .entry(message_id)
            .or_default()
            .insert(emoji, user_ids);
    }
    by_message
        .into_iter()
        .map(|(mid, emojis)| {
            let reactions: Vec<ChatReaction> = emojis
                .into_iter()
                .map(|(emoji, user_ids)| {
                    let count = user_ids.len() as i64;
                    let reacted_by_me = user_ids.contains(&viewer_id);
                    ChatReaction {
                        emoji,
                        count,
                        user_ids,
                        reacted_by_me,
                    }
                })
                .collect();
            (mid, reactions)
        })
        .collect()
}

fn batch_attachments_for_messages(
    conn: &crate::db::Connection,
    message_ids: &[i64],
) -> std::collections::HashMap<i64, Vec<crate::models::chat::ChatAttachment>> {
    use std::collections::HashMap;
    if message_ids.is_empty() {
        return HashMap::new();
    }
    let placeholders = message_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT a.message_id, a.id, a.file_name, a.file_url, a.file_size, a.mime_type
         FROM chat_message_attachments a
         WHERE a.message_id IN ({placeholders})"
    );
    let params: Vec<crate::db::ParamValue> = message_ids
        .iter()
        .map(|id| crate::db::into_param_value(*id))
        .collect();
    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return HashMap::new(),
    };
    let mut by_message: HashMap<i64, Vec<crate::models::chat::ChatAttachment>> = HashMap::new();
    let rows = stmt.query_map(crate::db::Params::from_values(params), |row| {
        Ok((
            row.get_idx::<i64>(0)?,
            crate::models::chat::ChatAttachment {
                id: row.get_idx::<i64>(1)?,
                file_name: row.get_idx::<String>(2)?,
                file_url: row.get_idx::<String>(3)?,
                file_size: row.get_idx::<i64>(4)?,
                mime_type: row.get_idx::<Option<String>>(5)?,
            },
        ))
    });
    for row in rows {
        by_message.entry(row.0).or_default().push(row.1);
    }
    by_message
}

fn fetch_message(
    conn: &crate::db::Connection,
    message_id: i64,
    org_id: i64,
    viewer_id: i64,
) -> Option<ChatMessage> {
    let reactions_json = build_reactions_json(conn, message_id, viewer_id);
    let attachments_json = build_attachments_json(conn, message_id);
    conn.query_row(
        "SELECT m.id, m.space_id, m.user_id, u.name AS user_name, u.email AS user_email, u.photo AS user_photo, m.parent_id, m.content,
                m.is_edited, m.is_deleted,
                CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END AS is_pinned,
                CASE WHEN st.message_id IS NOT NULL THEN 1 ELSE 0 END AS is_starred,
                (SELECT COUNT(*) FROM chat_messages t WHERE t.parent_id = m.id AND t.is_deleted = 0) AS thread_count,
                m.mentions_json, m.created_at, m.updated_at
         FROM chat_messages m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN chat_pinned_messages p ON p.message_id = m.id
         LEFT JOIN chat_starred_messages st ON st.message_id = m.id AND st.user_id = ?3
         WHERE m.id = ?1 AND m.organization_id = ?2",
        crate::params![message_id, org_id, viewer_id],
        |row| {
            let mentions_raw: Option<String> = row.get("mentions_json")?;
            let mentions: Vec<i64> = mentions_raw
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default();
            let reactions: Vec<ChatReaction> =
                serde_json::from_str(&reactions_json).unwrap_or_default();
            let attachments: Vec<crate::models::chat::ChatAttachment> =
                serde_json::from_str(&attachments_json).unwrap_or_default();
            Ok(ChatMessage {
                id: row.get("id")?,
                space_id: row.get("space_id")?,
                user_id: row.get("user_id")?,
                user_name: row.get("user_name")?,
                user_email: row.get("user_email")?,
                user_photo: row.get("user_photo")?,
                parent_id: row.get("parent_id")?,
                content: row.get("content")?,
                is_edited: row.get_boolish("is_edited")?,
                is_deleted: row.get_boolish("is_deleted")?,
                is_pinned: row.get_boolish("is_pinned")?,
                is_starred: row.get_boolish("is_starred")?,
                thread_count: row.get("thread_count")?,
                reactions,
                attachments,
                mentions,
                created_at: row.get_string_flex("created_at")?,
                updated_at: row.get_string_flex("updated_at")?,
            })
        },
    )
    .optional().ok().flatten()
}

fn auto_join_public_channels(conn: &crate::db::Connection, org_id: i64, user_id: i64) {
    let now = now_ts();
    let _ = conn.execute(
        "INSERT OR IGNORE INTO chat_space_members (space_id, user_id, role, joined_at)
         SELECT id, ?2, 'member', ?3 FROM chat_spaces
         WHERE organization_id = ?1 AND kind = 'channel' AND is_private = 0",
        crate::params![org_id, user_id, &now],
    );
}

/// GET /api/admin/chat/spaces
pub async fn spaces_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    // Keep this path read-cheap. Full department sync belongs on dept/user mutations.
    let _ = ensure_general_channel(&conn, org_id, user_id);
    crate::chat_department_channels::ensure_viewer_department_membership(&conn, org_id, user_id);
    auto_join_public_channels(&conn, org_id, user_id);

    let mut spaces: Vec<ChatSpace> = match conn.query_map_result(
        "SELECT s.id, s.organization_id, s.kind, s.name, s.slug, s.description, s.topic, s.is_private,
                s.department_id, s.created_by, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM chat_space_members m WHERE m.space_id = s.id) AS member_count,
                (SELECT COUNT(*) FROM chat_messages msg
                 WHERE msg.space_id = s.id AND msg.is_deleted = 0
                   AND msg.created_at > COALESCE(mem.last_read_at, '1970-01-01')
                   AND msg.user_id != ?2) AS unread_count,
                (SELECT created_at FROM chat_messages WHERE space_id = s.id AND parent_id IS NULL AND is_deleted = 0 ORDER BY id DESC LIMIT 1) AS last_message_at,
                (SELECT substr(content, 1, 80) FROM chat_messages WHERE space_id = s.id AND parent_id IS NULL AND is_deleted = 0 ORDER BY id DESC LIMIT 1) AS last_message_preview
         FROM chat_spaces s
         JOIN chat_space_members mem ON mem.space_id = s.id AND mem.user_id = ?2
         WHERE s.organization_id = ?1
         ORDER BY s.kind ASC,
                  COALESCE((SELECT MAX(created_at) FROM chat_messages WHERE space_id = s.id), s.updated_at) DESC",
        crate::params![org_id, user_id],
        |row| {
            Ok(ChatSpace {
                id: row.get("id")?,
                organization_id: row.get("organization_id")?,
                kind: row.get("kind")?,
                name: row.get("name")?,
                slug: row.get("slug")?,
                description: row.get("description")?,
                topic: row.get("topic")?,
                is_private: row.get_boolish("is_private")?,
                department_id: row.get("department_id")?,
                created_by: row.get("created_by")?,
                created_at: row.get_string_flex("created_at")?,
                updated_at: row.get_string_flex("updated_at")?,
                member_count: row.get("member_count")?,
                unread_count: row.get("unread_count")?,
                last_message_at: row.get("last_message_at")?,
                last_message_preview: row.get("last_message_preview")?,
                dm_members: None,
            })
        },
    ) {
        Ok(rows) => rows,
        Err(e) => {
            log::warn!("chat spaces list failed for org {org_id}: {e}");
            return HttpResponse::InternalServerError().json(ApiError::new("Failed to load spaces"));
        }
    };

    for space in &mut spaces {
        if space.kind != "dm" {
            continue;
        }
        space.dm_members = Some(load_dm_members(&conn, space.id, user_id));
        if let Some(members) = &space.dm_members {
            if members.len() == 1 {
                space.name = Some(members[0].name.clone());
            } else if members.len() > 1 {
                space.name = Some(
                    members
                        .iter()
                        .map(|m| m.name.split_whitespace().next().unwrap_or(&m.name))
                        .collect::<Vec<_>>()
                        .join(", "),
                );
            }
        }
    }

    HttpResponse::Ok().json(ApiResponse::success(spaces))
}

/// POST /api/admin/chat/channels
pub async fn channels_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<CreateChannelBody>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let name = body.name.trim();
    if name.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Channel name is required"));
    }
    let slug = slugify(name);
    let is_private = body.is_private.unwrap_or(false);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    if conn
        .query_row(
            "SELECT 1 FROM chat_spaces WHERE organization_id = ?1 AND slug = ?2",
            crate::params![org_id, &slug],
            |_| Ok(()),
        )
        .optional().is_ok()
    {
        return HttpResponse::Conflict().json(ApiError::new("A channel with this name already exists"));
    }

    let now = now_ts();
    if conn
        .execute(
            "INSERT INTO chat_spaces (organization_id, kind, name, slug, description, is_private, created_by, created_at, updated_at)
             VALUES (?1, 'channel', ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            crate::params![
                org_id,
                name,
                &slug,
                body.description,
                if is_private { 1 } else { 0 },
                user_id,
                &now
            ],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to create channel"));
    }
    let space_id = conn.last_insert_rowid();
    let _ = conn.execute(
        "INSERT INTO chat_space_members (space_id, user_id, role, joined_at) VALUES (?1, ?2, 'admin', ?3)",
        crate::params![space_id, user_id, &now],
    );

    if is_private {
        if let Some(ids) = &body.member_ids {
            let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
            for uid in ids {
                if *uid != user_id && !user_in_organization(&conn, *uid, org_id) {
                    return HttpResponse::BadRequest()
                        .json(ApiError::new("Member does not belong to this organization"));
                }
                if *uid != user_id {
                    if let Err(resp) =
                        crate::branch_scope::require_user_in_scope(&conn, *uid, org_id, &scope)
                    {
                        return resp;
                    }
                }
            }
            for uid in ids {
                if *uid != user_id {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO chat_space_members (space_id, user_id, role, joined_at) VALUES (?1, ?2, 'member', ?3)",
                        crate::params![space_id, uid, &now],
                    );
                }
            }
        }
    }

    match load_space_row(&conn, space_id, org_id, user_id) {
        Some(space) => HttpResponse::Created().json(ApiResponse::success(space)),
        None => HttpResponse::InternalServerError().json(ApiError::new("Failed to load channel")),
    }
}

/// PATCH /api/admin/chat/channels/{id}
pub async fn channels_update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<UpdateChannelBody>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let space_id = path.into_inner();
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    if let Some(resp) = ensure_space_access(&conn, space_id, org_id, user_id) {
        return resp;
    }

    let existing: Option<(String, String)> = conn
        .query_row(
            "SELECT kind, COALESCE(name,'') FROM chat_spaces WHERE id = ?1 AND organization_id = ?2",
            crate::params![space_id, org_id],
            |r| Ok((r.get_idx::<String>(0)?, r.get_idx::<String>(1)?)),
        )
        .optional()
        .ok()
        .flatten();
    let Some((kind, old_name)) = existing else {
        return HttpResponse::NotFound().json(ApiError::new("Channel not found"));
    };
    if kind != "channel" {
        return HttpResponse::BadRequest().json(ApiError::new("Not a channel"));
    }

    let name = body.name.as_deref().unwrap_or(&old_name);
    let slug = slugify(name);
    let now = now_ts();
    match conn.execute(
        "UPDATE chat_spaces SET name = ?1, slug = ?2, description = COALESCE(?3, description), topic = COALESCE(?4, topic), updated_at = ?5
         WHERE id = ?6 AND organization_id = ?7",
        crate::params![name, &slug, body.description, body.topic, &now, space_id, org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Channel not found")),
        Ok(_) => match load_space_row(&conn, space_id, org_id, user_id) {
            Some(space) => HttpResponse::Ok().json(ApiResponse::success(space)),
            None => HttpResponse::InternalServerError().json(ApiError::new("Failed to load channel")),
        },
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

/// POST /api/admin/chat/channels/{id}/join
pub async fn channels_join(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let space_id = path.into_inner();
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let is_private: i64 = conn
        .query_row(
            "SELECT is_private FROM chat_spaces WHERE id = ?1 AND organization_id = ?2 AND kind = 'channel'",
            crate::params![space_id, org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(1);
    if is_private != 0 {
        return HttpResponse::Forbidden().json(ApiError::new("Cannot join a private channel without invite"));
    }
    let now = now_ts();
    let _ = conn.execute(
        "INSERT OR IGNORE INTO chat_space_members (space_id, user_id, role, joined_at) VALUES (?1, ?2, 'member', ?3)",
        crate::params![space_id, user_id, &now],
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"joined": true})))
}

/// POST /api/admin/chat/channels/{id}/leave
pub async fn channels_leave(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let space_id = path.into_inner();
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let slug: Option<String> = conn
        .query_row(
            "SELECT slug FROM chat_spaces WHERE id = ?1 AND organization_id = ?2",
            crate::params![space_id, org_id],
            |r| r.get_idx::<String>(0),
        )
        .optional()
        .ok()
        .flatten();
    if slug.as_deref() == Some("general") {
        return HttpResponse::BadRequest().json(ApiError::new("Cannot leave #general"));
    }
    let _ = conn.execute(
        "DELETE FROM chat_space_members WHERE space_id = ?1 AND user_id = ?2",
        crate::params![space_id, user_id],
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"left": true})))
}

/// POST /api/admin/chat/channels/{id}/members
pub async fn channels_add_members(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<AddMembersBody>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let space_id = path.into_inner();
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    if let Some(resp) = ensure_space_access(&conn, space_id, org_id, user_id) {
        return resp;
    }
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    for uid in &body.user_ids {
        if !user_in_organization(&conn, *uid, org_id) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("Member does not belong to this organization"));
        }
        if let Err(resp) = crate::branch_scope::require_user_in_scope(&conn, *uid, org_id, &scope) {
            return resp;
        }
    }
    let now = now_ts();
    for uid in &body.user_ids {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO chat_space_members (space_id, user_id, role, joined_at) VALUES (?1, ?2, 'member', ?3)",
            crate::params![space_id, uid, &now],
        );
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"added": body.user_ids.len()})))
}

/// POST /api/admin/chat/dm
pub async fn dm_store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<CreateDmBody>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let mut ids = body.user_ids.clone();
    if !ids.contains(&user_id) {
        ids.push(user_id);
    }
    ids.sort_unstable();
    ids.dedup();
    if ids.len() < 2 {
        return HttpResponse::BadRequest().json(ApiError::new("Select at least one other person"));
    }

    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    for uid in &ids {
        if !user_in_organization(&conn, *uid, org_id) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("Member does not belong to this organization"));
        }
        if *uid != user_id {
            if let Err(resp) =
                crate::branch_scope::require_user_in_scope(&conn, *uid, org_id, &scope)
            {
                return resp;
            }
        }
    }

    let hash = dm_hash(&ids);

    if let Some(existing_id) = conn
        .query_row(
            "SELECT id FROM chat_spaces WHERE organization_id = ?1 AND kind = 'dm' AND dm_hash = ?2",
            crate::params![org_id, &hash],
            |r| r.get_idx::<i64>(0),
        )
        .optional().ok().flatten()
    {
        if let Some(mut space) = load_space_row(&conn, existing_id, org_id, user_id) {
            space.dm_members = Some(load_dm_members(&conn, existing_id, user_id));
            return HttpResponse::Ok().json(ApiResponse::success(space));
        }
    }

    let now = now_ts();
    if let Err(_) = conn.execute(
        "INSERT INTO chat_spaces (organization_id, kind, dm_hash, is_private, created_by, created_at, updated_at)
         VALUES (?1, 'dm', ?2, 1, ?3, ?4, ?4)",
        crate::params![org_id, &hash, user_id, &now],
    ) {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to create DM"));
    }
    let space_id = conn.last_insert_rowid();
    for uid in &ids {
        let _ = conn.execute(
            "INSERT INTO chat_space_members (space_id, user_id, role, joined_at) VALUES (?1, ?2, 'member', ?3)",
            crate::params![space_id, uid, &now],
        );
    }

    match load_space_row(&conn, space_id, org_id, user_id) {
        Some(mut space) => {
            space.dm_members = Some(load_dm_members(&conn, space_id, user_id));
            HttpResponse::Created().json(ApiResponse::success(space))
        }
        None => HttpResponse::InternalServerError().json(ApiError::new("Failed to create DM")),
    }
}

#[derive(serde::Deserialize)]
pub struct MessagesQuery {
    pub before: Option<i64>,
    pub limit: Option<i64>,
    pub parent_id: Option<i64>,
    pub thread: Option<bool>,
}

/// GET /api/admin/chat/spaces/{id}/messages
pub async fn messages_index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    query: web::Query<MessagesQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let space_id = path.into_inner();
    let limit = query.limit.unwrap_or(50).clamp(1, 100);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    if let Some(resp) = ensure_space_access(&conn, space_id, org_id, user_id) {
        return resp;
    }

    let parent_filter = if query.thread.unwrap_or(false) {
        if let Some(pid) = query.parent_id {
            format!("AND m.parent_id = {pid}")
        } else {
            "AND m.parent_id IS NOT NULL".to_string()
        }
    } else if let Some(pid) = query.parent_id {
        format!("AND m.parent_id = {pid}")
    } else {
        "AND m.parent_id IS NULL".to_string()
    };

    let before_filter = query
        .before
        .map(|b| format!("AND m.id < {b}"))
        .unwrap_or_default();

    let sql = format!(
        "SELECT m.id, m.space_id, m.user_id, u.name AS user_name, u.email AS user_email, u.photo AS user_photo, m.parent_id, m.content,
                m.is_edited, m.is_deleted,
                CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END AS is_pinned,
                CASE WHEN st.message_id IS NOT NULL THEN 1 ELSE 0 END AS is_starred,
                (SELECT COUNT(*) FROM chat_messages t WHERE t.parent_id = m.id AND t.is_deleted = 0) AS thread_count,
                m.mentions_json, m.created_at, m.updated_at
         FROM chat_messages m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN chat_pinned_messages p ON p.message_id = m.id
         LEFT JOIN chat_starred_messages st ON st.message_id = m.id AND st.user_id = ?3
         WHERE m.space_id = ?1 AND m.organization_id = ?2 {parent_filter} {before_filter}
         ORDER BY m.id DESC LIMIT {limit}"
    );

    let mut messages: Vec<ChatMessage> = match conn.query_map_result(&sql, crate::params![space_id, org_id, user_id], |row| {
            let message_id: i64 = row.get("id")?;
            let mentions_raw: Option<String> = row.get("mentions_json")?;
            let mentions: Vec<i64> = mentions_raw
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default();
            Ok(ChatMessage {
                id: message_id,
                space_id: row.get("space_id")?,
                user_id: row.get("user_id")?,
                user_name: row.get("user_name")?,
                user_email: row.get("user_email")?,
                user_photo: row.get("user_photo")?,
                parent_id: row.get("parent_id")?,
                content: row.get("content")?,
                is_edited: row.get_boolish("is_edited")?,
                is_deleted: row.get_boolish("is_deleted")?,
                is_pinned: row.get_boolish("is_pinned")?,
                is_starred: row.get_boolish("is_starred")?,
                thread_count: row.get("thread_count")?,
                reactions: Vec::new(),
                attachments: Vec::new(),
                mentions,
                created_at: row.get_string_flex("created_at")?,
                updated_at: row.get_string_flex("updated_at")?,
            })
        }) {
        Ok(rows) => rows,
        Err(e) => {
            log::warn!("chat messages row mapping failed for space {space_id}: {e}");
            Vec::new()
        }
    };

    let message_ids: Vec<i64> = messages.iter().map(|m| m.id).collect();
    let reactions_map = batch_reactions_for_messages(&conn, &message_ids, user_id);
    let attachments_map = batch_attachments_for_messages(&conn, &message_ids);

    for msg in &mut messages {
        msg.reactions = reactions_map
            .get(&msg.id)
            .cloned()
            .unwrap_or_default();
        msg.attachments = attachments_map
            .get(&msg.id)
            .cloned()
            .unwrap_or_default();
    }
    messages.reverse();

    HttpResponse::Ok().json(ApiResponse::success(messages))
}

/// POST /api/admin/chat/spaces/{id}/messages
pub async fn messages_store(
    pool: web::Data<DbPool>,
    events: web::Data<ChatEvents>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<SendMessageBody>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let space_id = path.into_inner();
    let content = body.content.trim();
    if content.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Message cannot be empty"));
    }
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    if let Some(resp) = ensure_space_access(&conn, space_id, org_id, user_id) {
        return resp;
    }

    if let Some(parent_id) = body.parent_id {
        let valid = conn
            .query_row(
                "SELECT 1 FROM chat_messages WHERE id = ?1 AND space_id = ?2 AND organization_id = ?3",
                crate::params![parent_id, space_id, org_id],
                |_| Ok(()),
            )
            .optional().is_ok();
        if !valid {
            return HttpResponse::BadRequest().json(ApiError::new("Invalid thread parent"));
        }
    }

    let mentions_json = serde_json::to_string(&body.mentions.clone().unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
    let now = now_ts();
    match conn.execute(
        "INSERT INTO chat_messages (organization_id, space_id, user_id, parent_id, content, mentions_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        crate::params![org_id, space_id, user_id, body.parent_id, content, &mentions_json, &now],
    ) {
        Ok(_) => {}
        Err(e) => {
            log::error!("chat message insert failed: {e}");
            return HttpResponse::InternalServerError().json(ApiError::new("Failed to send message"));
        }
    }
    let message_id = conn.last_insert_rowid();

    if let Some(aids) = &body.attachment_ids {
        for aid in aids {
            let _ = conn.execute(
                "UPDATE chat_message_attachments SET message_id = ?1 WHERE id = ?2 AND message_id IS NULL AND uploaded_by = ?3",
                crate::params![message_id, aid, user_id],
            );
        }
    }

    let _ = conn.execute(
        "UPDATE chat_spaces SET updated_at = ?1 WHERE id = ?2",
        crate::params![&now, space_id],
    );

    let message = fetch_message(&conn, message_id, org_id, user_id);
    if let Some(ref msg) = message {
        events.emit(
            org_id,
            "message.new",
            serde_json::json!({ "space_id": space_id, "message": msg }),
        );
    }

    match message {
        Some(msg) => HttpResponse::Created().json(ApiResponse::success(msg)),
        None => HttpResponse::InternalServerError().json(ApiError::new("Failed to load message")),
    }
}

/// PATCH /api/admin/chat/messages/{id}
pub async fn messages_update(
    pool: web::Data<DbPool>,
    events: web::Data<ChatEvents>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<EditMessageBody>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let message_id = path.into_inner();
    let content = body.content.trim();
    if content.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Message cannot be empty"));
    }
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let owner: Option<i64> = conn
        .query_row(
            "SELECT user_id FROM chat_messages WHERE id = ?1 AND organization_id = ?2 AND is_deleted = 0",
            crate::params![message_id, org_id],
            |r| r.get_idx::<i64>(0),
        )
        .optional().ok().flatten();
    let Some(owner_id) = owner else {
        return HttpResponse::NotFound().json(ApiError::new("Message not found"));
    };
    if owner_id != user_id
        && !crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id)
    {
        return HttpResponse::Forbidden().json(ApiError::new("Can only edit your own messages"));
    }

    let now = now_ts();
    let space_id: i64 = conn
        .query_row(
            "SELECT space_id FROM chat_messages WHERE id = ?1",
            [message_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    if let Err(_) = conn.execute(
        "UPDATE chat_messages SET content = ?1, is_edited = 1, updated_at = ?2
         WHERE id = ?3 AND organization_id = ?4",
        crate::params![content, &now, message_id, org_id],
    ) {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to update message"));
    }

    let message = fetch_message(&conn, message_id, org_id, user_id);
    if let Some(ref msg) = message {
        events.emit(
            org_id,
            "message.updated",
            serde_json::json!({ "space_id": space_id, "message": msg }),
        );
    }
    match message {
        Some(msg) => HttpResponse::Ok().json(ApiResponse::success(msg)),
        None => HttpResponse::NotFound().json(ApiError::new("Message not found")),
    }
}

/// DELETE /api/admin/chat/messages/{id}
pub async fn messages_destroy(
    pool: web::Data<DbPool>,
    events: web::Data<ChatEvents>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let message_id = path.into_inner();
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let row: Option<(i64, i64)> = conn
        .query_row(
            "SELECT user_id, space_id FROM chat_messages WHERE id = ?1 AND organization_id = ?2",
            crate::params![message_id, org_id],
            |r| Ok((r.get_idx::<i64>(0)?, r.get_idx::<i64>(1)?)),
        )
        .optional().ok().flatten();
    let Some((owner_id, space_id)) = row else {
        return HttpResponse::NotFound().json(ApiError::new("Message not found"));
    };
    if owner_id != user_id
        && !crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id)
    {
        return HttpResponse::Forbidden().json(ApiError::new("Can only delete your own messages"));
    }

    let now = now_ts();
    if let Err(_) = conn.execute(
        "UPDATE chat_messages SET is_deleted = 1, content = '[deleted]', updated_at = ?1 WHERE id = ?2",
        crate::params![&now, message_id],
    ) {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to delete message"));
    }

    events.emit(
        org_id,
        "message.deleted",
        serde_json::json!({ "space_id": space_id, "message_id": message_id }),
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"deleted": true})))
}

/// POST /api/admin/chat/messages/{id}/reactions
pub async fn messages_react(
    pool: web::Data<DbPool>,
    events: web::Data<ChatEvents>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<ReactionBody>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let message_id = path.into_inner();
    let emoji = body.emoji.trim();
    if emoji.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Emoji required"));
    }
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let space_id: Option<i64> = conn
        .query_row(
            "SELECT space_id FROM chat_messages WHERE id = ?1 AND organization_id = ?2",
            crate::params![message_id, org_id],
            |r| r.get_idx::<i64>(0),
        )
        .optional().ok().flatten();
    let Some(space_id) = space_id else {
        return HttpResponse::NotFound().json(ApiError::new("Message not found"));
    };
    if let Some(resp) = ensure_space_access(&conn, space_id, org_id, user_id) {
        return resp;
    }

    let exists = conn
        .query_row(
            "SELECT 1 FROM chat_message_reactions WHERE message_id = ?1 AND user_id = ?2 AND emoji = ?3",
            crate::params![message_id, user_id, emoji],
            |_| Ok(()),
        )
        .optional().is_ok();

    if exists {
        let _ = conn.execute(
            "DELETE FROM chat_message_reactions WHERE message_id = ?1 AND user_id = ?2 AND emoji = ?3",
            crate::params![message_id, user_id, emoji],
        );
    } else {
        let now = now_ts();
        let _ = conn.execute(
            "INSERT INTO chat_message_reactions (message_id, user_id, emoji, created_at) VALUES (?1, ?2, ?3, ?4)",
            crate::params![message_id, user_id, emoji, &now],
        );
    }

    let reactions_json = build_reactions_json(&conn, message_id, user_id);
    events.emit(
        org_id,
        "reaction.updated",
        serde_json::json!({ "space_id": space_id, "message_id": message_id, "reactions": serde_json::from_str::<serde_json::Value>(&reactions_json).unwrap_or_default() }),
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::from_str::<serde_json::Value>(&reactions_json).unwrap_or_default()))
}

/// POST /api/admin/chat/messages/{id}/pin
pub async fn messages_pin(
    pool: web::Data<DbPool>,
    events: web::Data<ChatEvents>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let message_id = path.into_inner();
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let row: Option<(i64, i64)> = conn
        .query_row(
            "SELECT space_id, user_id FROM chat_messages WHERE id = ?1 AND organization_id = ?2 AND is_deleted = 0",
            crate::params![message_id, org_id],
            |r| Ok((r.get_idx::<i64>(0)?, r.get_idx::<i64>(1)?)),
        )
        .optional().ok().flatten();
    let Some((space_id, _)) = row else {
        return HttpResponse::NotFound().json(ApiError::new("Message not found"));
    };
    if let Some(resp) = ensure_space_access(&conn, space_id, org_id, user_id) {
        return resp;
    }

    let pinned = conn
        .query_row(
            "SELECT 1 FROM chat_pinned_messages WHERE space_id = ?1 AND message_id = ?2",
            crate::params![space_id, message_id],
            |_| Ok(()),
        )
        .optional().is_ok();

    if pinned {
        let _ = conn.execute(
            "DELETE FROM chat_pinned_messages WHERE space_id = ?1 AND message_id = ?2",
            crate::params![space_id, message_id],
        );
    } else {
        let now = now_ts();
        let _ = conn.execute(
            "INSERT OR IGNORE INTO chat_pinned_messages (space_id, message_id, pinned_by, pinned_at) VALUES (?1, ?2, ?3, ?4)",
            crate::params![space_id, message_id, user_id, &now],
        );
    }

    events.emit(
        org_id,
        "message.pinned",
        serde_json::json!({ "space_id": space_id, "message_id": message_id, "pinned": !pinned }),
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"pinned": !pinned})))
}

/// POST /api/admin/chat/messages/{id}/star
pub async fn messages_star(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let message_id = path.into_inner();
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let space_id: Option<i64> = conn
        .query_row(
            "SELECT space_id FROM chat_messages WHERE id = ?1 AND organization_id = ?2",
            crate::params![message_id, org_id],
            |r| r.get_idx::<i64>(0),
        )
        .optional().ok().flatten();
    let Some(space_id) = space_id else {
        return HttpResponse::NotFound().json(ApiError::new("Message not found"));
    };
    if let Some(resp) = ensure_space_access(&conn, space_id, org_id, user_id) {
        return resp;
    }

    let starred = conn
        .query_row(
            "SELECT 1 FROM chat_starred_messages WHERE user_id = ?1 AND message_id = ?2",
            crate::params![user_id, message_id],
            |_| Ok(()),
        )
        .optional().is_ok();

    if starred {
        let _ = conn.execute(
            "DELETE FROM chat_starred_messages WHERE user_id = ?1 AND message_id = ?2",
            crate::params![user_id, message_id],
        );
    } else {
        let now = now_ts();
        let _ = conn.execute(
            "INSERT INTO chat_starred_messages (user_id, message_id, created_at) VALUES (?1, ?2, ?3)",
            crate::params![user_id, message_id, &now],
        );
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"starred": !starred})))
}

/// POST /api/admin/chat/spaces/{id}/read
pub async fn spaces_mark_read(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let space_id = path.into_inner();
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    if let Some(resp) = ensure_space_access(&conn, space_id, org_id, user_id) {
        return resp;
    }
    let now = now_ts();
    let _ = conn.execute(
        "UPDATE chat_space_members SET last_read_at = ?1 WHERE space_id = ?2 AND user_id = ?3",
        crate::params![&now, space_id, user_id],
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"read": true})))
}

#[derive(serde::Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

/// GET /api/admin/chat/search
pub async fn search(pool: web::Data<DbPool>, req: HttpRequest, query: web::Query<SearchQuery>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let term = query.q.trim();
    if term.len() < 2 {
        return HttpResponse::BadRequest().json(ApiError::new("Search term too short"));
    }
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let pattern = format!("%{term}%");
    let stmt = match conn.prepare(
        "SELECT m.id FROM chat_messages m
         JOIN chat_space_members mem ON mem.space_id = m.space_id AND mem.user_id = ?3
         WHERE m.organization_id = ?1 AND m.is_deleted = 0 AND m.content LIKE ?2
         ORDER BY m.id DESC LIMIT 50",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let ids: Vec<i64> = stmt
        .query_map(crate::params![org_id, &pattern, user_id], |r| r.get_idx::<i64>(0));

    let messages: Vec<ChatMessage> = ids
        .into_iter()
        .filter_map(|id| fetch_message(&conn, id, org_id, user_id))
        .collect();

    HttpResponse::Ok().json(ApiResponse::success(messages))
}

/// GET /api/admin/chat/spaces/{id}/pins
pub async fn pins_index(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let space_id = path.into_inner();
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    if let Some(resp) = ensure_space_access(&conn, space_id, org_id, user_id) {
        return resp;
    }

    let stmt = match conn.prepare(
        "SELECT message_id FROM chat_pinned_messages WHERE space_id = ?1 ORDER BY pinned_at DESC",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let messages: Vec<ChatMessage> = stmt
        .query_map([space_id], |r| r.get_idx::<i64>(0))
        .into_iter()
        .filter_map(|id| fetch_message(&conn, id, org_id, user_id))
        .collect();

    HttpResponse::Ok().json(ApiResponse::success(messages))
}

/// GET /api/admin/chat/starred
pub async fn starred_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let stmt = match conn.prepare(
        "SELECT message_id FROM chat_starred_messages WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let messages: Vec<ChatMessage> = stmt
        .query_map([user_id], |r| r.get_idx::<i64>(0))
        .into_iter()
        .filter_map(|id| fetch_message(&conn, id, org_id, user_id))
        .collect();

    HttpResponse::Ok().json(ApiResponse::success(messages))
}

/// GET /api/admin/chat/users
pub async fn users_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let cutoff = chrono::Utc::now() - chrono::Duration::minutes(15);
    let cutoff_str = cutoff.format("%Y-%m-%d %H:%M:%S").to_string();
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);

    let mut sql = String::from(
        "SELECT u.id, u.name, u.email, u.photo,
                CASE WHEN p.last_active_at >= ?2 THEN 1 ELSE 0 END AS is_online
         FROM users u
         LEFT JOIN user_presence p ON p.user_id = u.id
         WHERE u.organization_id = ?1 AND u.deleted_at IS NULL",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(org_id),
        crate::db::into_param_value(cutoff_str),
    ];
    crate::branch_scope::append_users_branch_filter(&mut sql, &mut params, &scope, "u");
    sql.push_str(" ORDER BY u.name");

    let users: Vec<ChatMember> = match conn.prepare(&sql) {
        Ok(stmt) => stmt.query_map(&params, |row| {
            Ok(ChatMember {
                user_id: row.get_idx::<i64>(0)?,
                name: row.get_idx::<String>(1)?,
                email: row.get_idx::<String>(2)?,
                photo: row.get_idx::<Option<String>>(3)?,
                is_online: row.get_idx::<i64>(4)? != 0,
            })
        }),
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    HttpResponse::Ok().json(ApiResponse::success(users))
}

/// POST /api/admin/chat/upload
pub async fn upload(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    mut payload: Multipart,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;

    let mut file_data: Option<(Vec<u8>, String, Option<String>)> = None;
    while let Some(item) = payload.next().await {
        let mut field = match item {
            Ok(f) => f,
            Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&format!("Upload error: {e}"))),
        };
        let field_name = field.name().unwrap_or("").to_string();
        let filename = field
            .content_disposition()
            .and_then(|d| d.get_filename().map(|s| s.to_string()))
            .unwrap_or_else(|| "file".to_string());
        let mime = field.content_type().map(|m| m.to_string());
        let mut bytes = Vec::new();
        while let Some(chunk) = field.next().await {
            match chunk {
                Ok(c) => bytes.extend_from_slice(&c),
                Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&format!("Upload error: {e}"))),
            }
        }
        if bytes.is_empty() {
            continue;
        }
        let candidate = (bytes, filename, mime);
        if field_name == "file" {
            file_data = Some(candidate);
            break;
        }
        if file_data.is_none() {
            file_data = Some(candidate);
        }
    }

    let Some((data, filename, mime)) = file_data else {
        return HttpResponse::BadRequest().json(ApiError::new("No file uploaded"));
    };

    if data.len() > 10 * 1024 * 1024 {
        return HttpResponse::BadRequest().json(ApiError::new("File must be under 10MB"));
    }

    let relative = match crate::storage::save_chat_file(&data, mime.as_deref(), Some(&filename)) {
        Ok(p) => p,
        Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&e)),
    };

    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let now = now_ts();
    let file_url = relative.clone();
    if conn
        .execute(
            "INSERT INTO chat_message_attachments (message_id, uploaded_by, file_name, file_url, file_size, mime_type, created_at)
             VALUES (NULL, ?1, ?2, ?3, ?4, ?5, ?6)",
            crate::params![user_id, &filename, &file_url, data.len() as i64, mime, &now],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to save attachment"));
    }

    HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
        "id": conn.last_insert_rowid(),
        "file_name": filename,
        "file_url": file_url,
        "file_size": data.len(),
        "mime_type": mime,
    })))
}

/// GET /api/admin/chat/ws?token=JWT
pub async fn chat_ws(
    req: HttpRequest,
    stream: web::Payload,
    pool: web::Data<DbPool>,
    events: web::Data<ChatEvents>,
    jwt: web::Data<Arc<String>>,
) -> Result<HttpResponse, Error> {
    let claims = ws_token_from_query(&req, jwt.as_str())?;
    let conn = pool
        .get()
        .map_err(|_| ErrorUnauthorized("Database unavailable"))?;
    if let Err(msg) = crate::middleware::rbac::ensure_ws_access(&conn, &claims, req.path()) {
        return Err(ErrorUnauthorized(msg));
    }
    let org_id = org_id_from_claims(&claims);

    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, stream)?;
    let mut rx = events.subscribe();

    actix_web::rt::spawn(async move {
        let welcome = serde_json::json!({
            "type": "connected",
            "organization_id": org_id,
            "message": "Team chat live stream active",
        });
        if session
            .text(serde_json::to_string(&welcome).unwrap_or_default())
            .await
            .is_err()
        {
            return;
        }

        loop {
            tokio::select! {
                incoming = msg_stream.next() => {
                    match incoming {
                        Some(Ok(Message::Text(text))) => {
                            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                                if v.get("type").and_then(|t| t.as_str()) == Some("typing") {
                                    let payload = serde_json::json!({
                                        "type": "typing",
                                        "organization_id": org_id,
                                        "space_id": v.get("space_id"),
                                        "user_id": claims.sub,
                                    });
                                    let _ = events.emit(org_id, "typing", payload);
                                }
                            }
                        }
                        Some(Ok(Message::Ping(bytes))) => {
                            if session.pong(&bytes).await.is_err() { break; }
                        }
                        Some(Ok(Message::Close(_))) | None => break,
                        Some(Err(_)) => break,
                        _ => {}
                    }
                }
                event = rx.recv() => {
                    match event {
                        Ok(text) => {
                            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                                let evt_org = v.get("organization_id").and_then(|o| o.as_i64()).unwrap_or(0);
                                if evt_org == org_id {
                                    if session.text(text).await.is_err() { break; }
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }
            }
        }
        let _ = session.close(None).await;
    });

    Ok(response)
}

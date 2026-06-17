use crate::db::{Connection, OptionalExt};

fn now_ts() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

pub fn department_channel_slug(dept_slug: &str) -> String {
    format!("dept-{}", dept_slug)
}

fn load_department(
    conn: &Connection,
    org_id: i64,
    dept_id: i64,
) -> crate::db::Result<Option<(String, String)>> {
    conn.query_row(
        "SELECT name, slug FROM departments WHERE id = ?1 AND organization_id = ?2",
        crate::params![dept_id, org_id],
        |row| Ok((row.get_idx::<String>(0)?, row.get_idx::<String>(1)?)),
    )
    .optional()
}

fn space_id_for_department(conn: &Connection, org_id: i64, dept_id: i64) -> Option<i64> {
    conn.query_row(
        "SELECT id FROM chat_spaces WHERE organization_id = ?1 AND department_id = ?2",
        crate::params![org_id, dept_id],
        |r| r.get_idx::<i64>(0),
    )
    .optional()
    .ok()
    .flatten()
}

fn sync_department_channel_members(
    conn: &Connection,
    space_id: i64,
    dept_id: i64,
    org_id: i64,
) -> crate::db::Result<()> {
    let now = now_ts();
    let mut stmt = conn.prepare(
        "SELECT id FROM users WHERE organization_id = ?1 AND department_id = ?2 AND deleted_at IS NULL",
    )?;
    let user_ids: Vec<i64> =
        stmt.query_map(crate::params![org_id, dept_id], |r| r.get_idx::<i64>(0));

    for user_id in &user_ids {
        conn.execute(
            "INSERT OR IGNORE INTO chat_space_members (space_id, user_id, role, joined_at) VALUES (?1, ?2, 'member', ?3)",
            crate::params![space_id, user_id, &now],
        )?;
    }

    if user_ids.is_empty() {
        conn.execute(
            "DELETE FROM chat_space_members WHERE space_id = ?1",
            crate::params![space_id],
        )?;
    } else {
        let placeholders = user_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "DELETE FROM chat_space_members WHERE space_id = ?1 AND user_id NOT IN ({placeholders})"
        );
        let mut sql_params: Vec<crate::db::ParamValue> =
            vec![crate::db::into_param_value(space_id)];
        for id in &user_ids {
            sql_params.push(crate::db::into_param_value(*id));
        }
        conn.execute(&sql, &sql_params)?;
    }

    Ok(())
}

/// Create or update the chat channel for a department and sync its members.
pub fn ensure_department_channel(
    conn: &Connection,
    org_id: i64,
    dept_id: i64,
    actor_user_id: i64,
) -> crate::db::Result<Option<i64>> {
    let Some((dept_name, dept_slug)) = load_department(conn, org_id, dept_id)? else {
        return Ok(None);
    };

    let channel_slug = department_channel_slug(&dept_slug);
    let description = format!("Private channel for {dept_name} department members");
    let now = now_ts();

    let space_id = if let Some(id) = space_id_for_department(conn, org_id, dept_id) {
        conn.execute(
            "UPDATE chat_spaces SET name = ?1, slug = ?2, description = ?3, is_private = 1, updated_at = ?4
             WHERE id = ?5 AND organization_id = ?6",
            crate::params![&dept_name, &channel_slug, &description, &now, id, org_id],
        )?;
        id
    } else {
        conn.execute(
            "INSERT INTO chat_spaces (organization_id, kind, name, slug, description, is_private, department_id, created_by, created_at, updated_at)
             VALUES (?1, 'channel', ?2, ?3, ?4, 1, ?5, ?6, ?7, ?7)",
            crate::params![
                org_id,
                &dept_name,
                &channel_slug,
                &description,
                dept_id,
                actor_user_id,
                &now,
            ],
        )?;
        conn.last_insert_rowid()
    };

    sync_department_channel_members(conn, space_id, dept_id, org_id)?;
    Ok(Some(space_id))
}

/// Ensure every department in the org has a channel with up-to-date membership.
pub fn sync_all_department_channels(conn: &Connection, org_id: i64, actor_user_id: i64) {
    let mut stmt = match conn.prepare(
        "SELECT id FROM departments WHERE organization_id = ?1 ORDER BY name",
    ) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("department channel sync: prepare failed: {e}");
            return;
        }
    };

    let dept_ids: Vec<i64> = stmt.query_map([org_id], |r| r.get_idx::<i64>(0));

    for dept_id in dept_ids {
        if let Err(e) = ensure_department_channel(conn, org_id, dept_id, actor_user_id) {
            log::warn!("department channel sync failed for dept {dept_id}: {e}");
        }
    }
}

/// Add the user to their department channel and remove them from other department channels.
pub fn sync_user_department_channel(conn: &Connection, org_id: i64, user_id: i64) {
    if let Err(e) = conn.execute(
        "DELETE FROM chat_space_members
         WHERE user_id = ?1
           AND space_id IN (
             SELECT id FROM chat_spaces WHERE organization_id = ?2 AND department_id IS NOT NULL
           )",
        crate::params![user_id, org_id],
    ) {
        log::warn!("clear department channel membership for user {user_id}: {e}");
        return;
    }

    let dept_id: Option<i64> = match conn.query_row(
        "SELECT department_id FROM users WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
        crate::params![user_id, org_id],
        |r| r.get_idx::<Option<i64>>(0),
    ) {
        Ok(dept_id) => dept_id,
        Err(_) => None,
    };

    let Some(dept_id) = dept_id else {
        return;
    };

    if let Err(e) = ensure_department_channel(conn, org_id, dept_id, user_id) {
        log::warn!("sync user {user_id} department channel: {e}");
    }
}

pub fn delete_department_channel(conn: &Connection, org_id: i64, dept_id: i64) {
    if let Err(e) = conn.execute(
        "DELETE FROM chat_spaces WHERE organization_id = ?1 AND department_id = ?2",
        crate::params![org_id, dept_id],
    ) {
        log::warn!("delete department channel for dept {dept_id}: {e}");
    }
}

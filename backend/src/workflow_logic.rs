//! Minimal workflow execution engine — fires on HR events (leave approved, etc.).

use crate::tenant::user_in_organization;

fn org_scoped_user(conn: &crate::db::Connection, org_id: i64, user_id: i64) -> Option<i64> {
    if user_in_organization(conn, user_id, org_id) {
        Some(user_id)
    } else {
        None
    }
}

fn resolve_assignee(
    conn: &crate::db::Connection,
    org_id: i64,
    created_by: i64,
    context: &serde_json::Value,
    action: &serde_json::Value,
) -> Option<i64> {
    let candidate = context
        .get("user_id")
        .and_then(|v| v.as_i64())
        .or_else(|| action.get("assigned_to").and_then(|v| v.as_i64()))
        .or_else(|| action.get("recipient_id").and_then(|v| v.as_i64()))
        .or_else(|| action.get("user_id").and_then(|v| v.as_i64()));
    match candidate {
        Some(uid) => org_scoped_user(conn, org_id, uid),
        None => org_scoped_user(conn, org_id, created_by),
    }
}
fn trigger_type_variants(trigger_type: &str) -> Vec<String> {
    match trigger_type {
        "leave_request_approved" | "leave_approved" => {
            vec![
                "leave_request_approved".to_string(),
                "leave_approved".to_string(),
            ]
        }
        "leave_request_rejected" | "leave_rejected" => {
            vec![
                "leave_request_rejected".to_string(),
                "leave_rejected".to_string(),
            ]
        }
        "leave_request_submitted" | "leave_submitted" => {
            vec![
                "leave_request_submitted".to_string(),
                "leave_submitted".to_string(),
            ]
        }
        "user_created" | "user_joined" => {
            vec!["user_created".to_string(), "user_joined".to_string()]
        }
        other => vec![other.to_string()],
    }
}

pub fn trigger(
    conn: &crate::db::Connection,
    org_id: i64,
    trigger_type: &str,
    context: &serde_json::Value,
) {
    let variants = trigger_type_variants(trigger_type);

    let mut workflows: Vec<(i64, String, Option<String>, Option<String>)> = Vec::new();
    for variant in variants {
        let stmt = match conn.prepare(
            "SELECT id, name, trigger_conditions, actions FROM workflows
             WHERE is_active = 1 AND trigger_type = ?1 AND organization_id = ?2",
        ) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let batch: Vec<_> = stmt
            .query_map(crate::params![variant, org_id], |row| {
                Ok((
                    row.get_idx::<i64>(0)?,
                    row.get_idx::<String>(1)?,
                    row.get_idx::<Option<String>>(2)?,
                    row.get_idx::<Option<String>>(3)?,
                ))
            });
        for wf in batch {
            if !workflows.iter().any(|(id, _, _, _)| *id == wf.0) {
                workflows.push(wf);
            }
        }
    }

    for (workflow_id, name, conditions_json, actions_json) in workflows {
        run_one_workflow(
            conn,
            org_id,
            workflow_id,
            &name,
            conditions_json.as_deref(),
            actions_json.as_deref(),
            trigger_type,
            context,
            true,
        );
    }
}

/// Execute a single workflow by id (for admin "Test with sample payload"), ignoring is_active.
pub fn test_workflow(
    conn: &crate::db::Connection,
    org_id: i64,
    workflow_id: i64,
    trigger_type: &str,
    context: &serde_json::Value,
) {
    let row: Option<(String, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT name, trigger_conditions, actions FROM workflows
             WHERE id = ?1 AND organization_id = ?2",
            crate::params![workflow_id, org_id],
            |r| {
                Ok((
                    r.get_idx::<String>(0)?,
                    r.get_idx::<Option<String>>(1)?,
                    r.get_idx::<Option<String>>(2)?,
                ))
            },
        )
        .ok();
    let Some((name, conditions_json, actions_json)) = row else {
        return;
    };
    run_one_workflow(
        conn,
        org_id,
        workflow_id,
        &name,
        conditions_json.as_deref(),
        actions_json.as_deref(),
        trigger_type,
        context,
        false,
    );
}

fn run_one_workflow(
    conn: &crate::db::Connection,
    org_id: i64,
    workflow_id: i64,
    name: &str,
    conditions_json: Option<&str>,
    actions_json: Option<&str>,
    trigger_type: &str,
    context: &serde_json::Value,
    enforce_conditions: bool,
) {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if enforce_conditions {
        if let Some(conditions_str) = conditions_json {
            if !conditions_str.trim().is_empty() {
                match serde_json::from_str::<serde_json::Value>(conditions_str) {
                    Ok(conditions) => {
                        if !conditions_match(&conditions, context) {
                            log::info!(
                                "Workflow '{}' (id={}) skipped — trigger conditions not met",
                                name,
                                workflow_id
                            );
                            return;
                        }
                    }
                    Err(e) => {
                        log::warn!(
                            "Workflow '{}' (id={}) skipped — invalid trigger_conditions: {}",
                            name,
                            workflow_id,
                            e
                        );
                        return;
                    }
                }
            }
        }
    }

    let created_by = context
        .get("approved_by")
        .or_else(|| context.get("created_by"))
        .or_else(|| context.get("rejected_by"))
        .or_else(|| context.get("user_id"))
        .and_then(|v| v.as_i64())
        .and_then(|uid| org_scoped_user(conn, org_id, uid));

    let execution_id = conn
        .execute(
            "INSERT INTO workflow_executions (workflow_id, status, trigger_type, created_at, updated_at)
             VALUES (?1, 'running', ?2, ?3, ?3)",
            crate::params![workflow_id, trigger_type, &now],
        )
        .map(|_| conn.last_insert_rowid());

    if let Some(actions_str) = actions_json {
        if let Ok(actions) = serde_json::from_str::<serde_json::Value>(actions_str) {
            let actions = normalize_workflow_actions(&actions);
            let (executed, skipped) = if let Some(actor) = created_by {
                execute_actions(conn, org_id, actor, name, &actions, context, &now)
            } else {
                log::warn!(
                    "Workflow '{}' (id={}) skipped actions — no org-scoped actor",
                    name,
                    workflow_id
                );
                (0, action_count(&actions))
            };

            if let Ok(exec_id) = execution_id {
                let exec_status = if skipped > 0 && executed == 0 {
                    "failed"
                } else if skipped > 0 {
                    "partial"
                } else {
                    "completed"
                };
                let _ = conn.execute(
                    "UPDATE workflow_executions SET status = ?1, updated_at = ?2 WHERE id = ?3",
                    crate::params![exec_status, &now, exec_id],
                );
            }

            if executed > 0 || skipped == 0 {
                let _ = conn.execute(
                    "UPDATE workflows SET execution_count = COALESCE(execution_count, 0) + 1, updated_at = ?1 WHERE id = ?2 AND organization_id = ?3",
                    crate::params![&now, workflow_id, org_id],
                );
                log::info!(
                    "Workflow '{}' (id={}) executed for trigger '{}' in org {} (status: {} executed, {} skipped)",
                    name,
                    workflow_id,
                    trigger_type,
                    org_id,
                    executed,
                    skipped
                );
            }
            return;
        }
    }

    if let Ok(exec_id) = execution_id {
        let _ = conn.execute(
            "UPDATE workflow_executions SET status = 'completed', updated_at = ?1 WHERE id = ?2",
            crate::params![&now, exec_id],
        );
    }

    let _ = conn.execute(
        "UPDATE workflows SET execution_count = COALESCE(execution_count, 0) + 1, updated_at = ?1 WHERE id = ?2 AND organization_id = ?3",
        crate::params![&now, workflow_id, org_id],
    );

    log::info!(
        "Workflow '{}' (id={}) executed for trigger '{}' in org {}",
        name,
        workflow_id,
        trigger_type,
        org_id
    );
}

fn conditions_match(conditions: &serde_json::Value, context: &serde_json::Value) -> bool {
    match conditions {
        serde_json::Value::Null => true,
        serde_json::Value::Array(arr) if arr.is_empty() => true,
        serde_json::Value::Array(arr) => arr.iter().all(|rule| evaluate_rule(rule, context)),
        serde_json::Value::Object(map) if map.is_empty() => true,
        serde_json::Value::Object(map) => map.iter().all(|(key, expected)| {
            context.get(key).map(|actual| values_equal(actual, expected)).unwrap_or(false)
        }),
        _ => true,
    }
}

fn evaluate_rule(rule: &serde_json::Value, context: &serde_json::Value) -> bool {
    let field = rule
        .get("field")
        .or_else(|| rule.get("key"))
        .and_then(|v| v.as_str());
    let Some(field) = field else {
        return true;
    };

    let actual = context.get(field);
    let operator = rule
        .get("operator")
        .or_else(|| rule.get("op"))
        .and_then(|v| v.as_str())
        .unwrap_or("equals");
    let expected = rule.get("value");

    match (actual, expected) {
        (Some(actual), Some(expected)) => compare_values(actual, expected, operator),
        (None, None) => operator == "empty" || operator == "is_null",
        (Some(_), None) => operator == "not_empty" || operator == "is_not_null",
        (None, Some(_)) => false,
    }
}

fn compare_values(actual: &serde_json::Value, expected: &serde_json::Value, operator: &str) -> bool {
    match operator {
        "equals" | "eq" | "==" => values_equal(actual, expected),
        "not_equals" | "neq" | "!=" => !values_equal(actual, expected),
        "contains" => actual
            .as_str()
            .map(|s| {
                expected
                    .as_str()
                    .map(|needle| s.contains(needle))
                    .unwrap_or(false)
            })
            .unwrap_or(false),
        "in" => expected
            .as_array()
            .map(|arr| arr.iter().any(|item| values_equal(actual, item)))
            .unwrap_or(false),
        "gte" | ">=" => numeric_compare(actual, expected, |a, b| a >= b),
        "lte" | "<=" => numeric_compare(actual, expected, |a, b| a <= b),
        "gt" | ">" => numeric_compare(actual, expected, |a, b| a > b),
        "lt" | "<" => numeric_compare(actual, expected, |a, b| a < b),
        _ => values_equal(actual, expected),
    }
}

fn numeric_compare(
    actual: &serde_json::Value,
    expected: &serde_json::Value,
    cmp: fn(f64, f64) -> bool,
) -> bool {
    let Some(a) = actual.as_f64().or_else(|| actual.as_i64().map(|v| v as f64)) else {
        return false;
    };
    let Some(b) = expected.as_f64().or_else(|| expected.as_i64().map(|v| v as f64)) else {
        return false;
    };
    cmp(a, b)
}

fn values_equal(actual: &serde_json::Value, expected: &serde_json::Value) -> bool {
    if actual == expected {
        return true;
    }
    match (actual, expected) {
        (serde_json::Value::String(a), serde_json::Value::String(b)) => {
            a.eq_ignore_ascii_case(b)
        }
        (serde_json::Value::Number(a), serde_json::Value::Number(b)) => {
            a.as_f64().unwrap_or(0.0) == b.as_f64().unwrap_or(0.0)
        }
        (serde_json::Value::Number(a), serde_json::Value::String(b)) => b
            .parse::<f64>()
            .map(|n| a.as_f64().unwrap_or(0.0) == n)
            .unwrap_or(false),
        (serde_json::Value::String(a), serde_json::Value::Number(b)) => a
            .parse::<f64>()
            .map(|n| n == b.as_f64().unwrap_or(0.0))
            .unwrap_or(false),
        _ => false,
    }
}

fn action_count(actions: &serde_json::Value) -> usize {
    match actions {
        serde_json::Value::Array(arr) => arr.len(),
        serde_json::Value::Object(_) => 1,
        _ => 0,
    }
}

fn action_field<'a>(action: &'a serde_json::Value, key: &str) -> Option<&'a serde_json::Value> {
    action
        .get(key)
        .or_else(|| action.get("config").and_then(|c| c.get(key)))
}

fn action_field_str<'a>(action: &'a serde_json::Value, key: &str) -> Option<&'a str> {
    action_field(action, key).and_then(|v| v.as_str())
}

fn action_field_i64(action: &serde_json::Value, key: &str) -> Option<i64> {
    action_field(action, key).and_then(|v| {
        v.as_i64()
            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    })
}

fn canonical_action_type(action_type: &str) -> &str {
    match action_type {
        "send_notification" | "notify" => "notification",
        "send_email" => "email",
        "assign_to_user" | "task" => "create_task",
        "webhook_post" | "http_webhook" => "webhook",
        "send_whatsapp" | "whatsapp_message" => "whatsapp",
        "assign_manager_notification" | "notify_manager" | "escalate_to_manager" => {
            "notify_manager"
        }
        other => other,
    }
}

pub const SUPPORTED_TRIGGER_TYPES: &[&str] = &[
    "leave_request_submitted",
    "leave_request_approved",
    "leave_request_rejected",
    "leave_submitted",
    "leave_approved",
    "leave_rejected",
    "attendance_clock_in",
    "attendance_late",
    "attendance_absent",
    "grocery_claim_submitted",
    "asset_expense_submitted",
    "doctor_report_published",
    "user_created",
    "user_joined",
    "payslip_generated",
    "task_overdue",
];

pub const SUPPORTED_ACTION_TYPES: &[&str] = &[
    "create_task",
    "notification",
    "email",
    "webhook",
    "whatsapp",
    "notify_manager",
];

pub fn validate_workflow_trigger(trigger_type: &str) -> Result<(), String> {
    let ok = trigger_type_variants(trigger_type)
        .iter()
        .any(|v| SUPPORTED_TRIGGER_TYPES.contains(&v.as_str()));
    if ok {
        Ok(())
    } else {
        Err(format!("Unsupported workflow trigger: {trigger_type}"))
    }
}

pub fn validate_workflow_actions(actions: &serde_json::Value) -> Result<(), String> {
    let normalized = normalize_workflow_actions(actions);
    let Some(arr) = normalized.as_array() else {
        return Err("Workflow actions must be an array".to_string());
    };
    if arr.is_empty() {
        return Err("At least one workflow action is required".to_string());
    }
    for action in arr {
        let t = action
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if t.is_empty() {
            return Err("Each workflow action must have a type".to_string());
        }
        // Unknown action types are allowed at save time; execution logs and skips them.
    }
    Ok(())
}

/// Flatten UI `{ type, config }` actions into engine-ready JSON (also accepts flat API format).
pub fn normalize_workflow_actions(actions: &serde_json::Value) -> serde_json::Value {
    let items = match actions {
        serde_json::Value::Array(arr) => arr.clone(),
        serde_json::Value::Object(_) => vec![actions.clone()],
        _ => return serde_json::json!([]),
    };

    let normalized: Vec<serde_json::Value> = items
        .into_iter()
        .filter_map(|action| {
            let raw_type = action
                .get("type")
                .or_else(|| action.get("action"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if raw_type.is_empty() {
                return None;
            }
            let canonical = canonical_action_type(raw_type);
            let mut flat = serde_json::Map::new();
            flat.insert(
                "type".to_string(),
                serde_json::Value::String(canonical.to_string()),
            );
            if let Some(cfg) = action.get("config").and_then(|v| v.as_object()) {
                for (k, v) in cfg {
                    flat.insert(k.clone(), v.clone());
                }
            }
            if let Some(obj) = action.as_object() {
                for (k, v) in obj {
                    if k == "type" || k == "action" || k == "config" {
                        continue;
                    }
                    flat.insert(k.clone(), v.clone());
                }
            }
            Some(serde_json::Value::Object(flat))
        })
        .collect();

    serde_json::Value::Array(normalized)
}

fn insert_org_notification(
    conn: &crate::db::Connection,
    org_id: i64,
    created_by: i64,
    title: &str,
    body: &str,
    recipient_user_id: Option<i64>,
    now: &str,
) -> bool {
    let (audience, target_id): (&str, Option<i64>) = if let Some(uid) = recipient_user_id {
        let dept: Option<i64> = conn
            .query_row(
                "SELECT department_id FROM users WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
                crate::params![uid, org_id],
                |row| row.get_idx::<Option<i64>>(0),
            )
            .ok()
            .flatten();
        if let Some(d) = dept {
            ("department", Some(d))
        } else {
            ("all", None)
        }
    } else {
        ("all", None)
    };

    conn.execute(
        "INSERT INTO org_notifications (organization_id, title, body, severity, audience, target_id, created_by, created_at)
         VALUES (?1, ?2, ?3, 'info', ?4, ?5, ?6, ?7)",
        crate::params![org_id, title, body, audience, target_id, created_by, now],
    )
    .is_ok()
}

fn due_date_from_action(action: &serde_json::Value, now: &str) -> Option<String> {
    let days = action_field_i64(action, "due_days")?;
    if days <= 0 {
        return None;
    }
    let base = chrono::NaiveDateTime::parse_from_str(now, "%Y-%m-%d %H:%M:%S")
        .ok()
        .map(|dt| dt.date())
        .or_else(|| chrono::NaiveDate::parse_from_str(now, "%Y-%m-%d").ok())?;
    Some((base + chrono::Duration::days(days)).format("%Y-%m-%d").to_string())
}

fn execute_actions(
    conn: &crate::db::Connection,
    org_id: i64,
    created_by: i64,
    workflow_name: &str,
    actions: &serde_json::Value,
    context: &serde_json::Value,
    now: &str,
) -> (usize, usize) {
    let items = match actions {
        serde_json::Value::Array(arr) => arr.clone(),
        serde_json::Value::Object(_) => vec![actions.clone()],
        _ => return (0, 0),
    };

    let mut executed = 0usize;
    let mut skipped = 0usize;

    for action in items {
        let raw_type = action
            .get("type")
            .or_else(|| action.get("action"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let action_type = canonical_action_type(raw_type);

        match action_type {
            "create_task" => {
                let title = action_field_str(&action, "title").unwrap_or("Workflow task");
                let Some(assignee) =
                    resolve_assignee(conn, org_id, created_by, context, &action)
                else {
                    log::warn!(
                        "Workflow '{}' skipped task '{}' — no org-scoped assignee",
                        workflow_name,
                        title
                    );
                    skipped += 1;
                    continue;
                };
                let due_date = due_date_from_action(&action, now);
                let inserted = if let Some(ref due) = due_date {
                    conn.execute(
                        "INSERT INTO tasks (title, description, status, priority, assigned_to, created_by, organization_id, due_date, created_at, updated_at)
                         VALUES (?1, ?2, 'todo', 'medium', ?3, ?4, ?5, ?6, ?7, ?7)",
                        crate::params![
                            format!("{}: {}", workflow_name, title),
                            format!("Auto-created by workflow. Context: {}", context),
                            assignee,
                            created_by,
                            org_id,
                            due,
                            now,
                        ],
                    )
                } else {
                    conn.execute(
                        "INSERT INTO tasks (title, description, status, priority, assigned_to, created_by, organization_id, created_at, updated_at)
                         VALUES (?1, ?2, 'todo', 'medium', ?3, ?4, ?5, ?6, ?6)",
                        crate::params![
                            format!("{}: {}", workflow_name, title),
                            format!("Auto-created by workflow. Context: {}", context),
                            assignee,
                            created_by,
                            org_id,
                            now,
                        ],
                    )
                };
                if inserted.is_ok() {
                    executed += 1;
                } else {
                    skipped += 1;
                }
            }
            "notification" | "log" => {
                let message = action_field_str(&action, "message")
                    .or_else(|| action_field_str(&action, "body"))
                    .unwrap_or("Workflow notification");
                let recipient = resolve_assignee(conn, org_id, created_by, context, &action);
                let title = format!("Workflow: {}", workflow_name);
                if insert_org_notification(
                    conn,
                    org_id,
                    created_by,
                    &title,
                    message,
                    recipient,
                    now,
                ) {
                    log::info!(
                        "Workflow notification [{}] to user {:?}: {}",
                        workflow_name,
                        recipient,
                        message
                    );
                    executed += 1;
                } else {
                    log::warn!(
                        "Workflow '{}' failed to create org notification",
                        workflow_name
                    );
                    skipped += 1;
                }
            }
            "email" => {
                let subject = action_field_str(&action, "subject")
                    .or_else(|| action_field_str(&action, "template"))
                    .unwrap_or("Workflow email");
                let body = action_field_str(&action, "message")
                    .or_else(|| action_field_str(&action, "body"))
                    .unwrap_or(subject);
                let recipient = resolve_assignee(conn, org_id, created_by, context, &action);
                let mut sent_smtp = false;
                if let Some(uid) = recipient {
                    if let Some(email) = crate::tenant_email::user_email(conn, uid) {
                        let plain = body.to_string();
                        let html = crate::tenant_email::render_base_template(
                            subject,
                            &format!(
                                r#"<p style="margin:0;font-size:15px;line-height:1.6;color:#64748b;">{}</p>"#,
                                crate::tenant_email::html_escape(body)
                            ),
                        );
                        if crate::smtp_config::resolve(conn, org_id).is_some() {
                            crate::tenant_email::send_tenant_email(
                                conn,
                                org_id,
                                &email,
                                subject,
                                plain,
                                html,
                            );
                            sent_smtp = true;
                            log::info!(
                                "Workflow email [{}] sent via SMTP to user {}: {}",
                                workflow_name,
                                uid,
                                subject
                            );
                        }
                    }
                }
                // Always keep in-app notice; use as sole path when SMTP unavailable.
                if insert_org_notification(
                    conn,
                    org_id,
                    created_by,
                    subject,
                    body,
                    recipient,
                    now,
                ) {
                    if !sent_smtp {
                        log::info!(
                            "Workflow email [{}] queued as in-app notice for user {:?}: {}",
                            workflow_name,
                            recipient,
                            subject
                        );
                    }
                    executed += 1;
                } else if sent_smtp {
                    executed += 1;
                } else {
                    skipped += 1;
                }
            }
            "webhook" => {
                let url = action_field_str(&action, "url").unwrap_or("");
                if url.is_empty() || !(url.starts_with("http://") || url.starts_with("https://")) {
                    log::warn!(
                        "Workflow '{}' skipped webhook — missing/invalid url",
                        workflow_name
                    );
                    skipped += 1;
                    continue;
                }
                let payload = serde_json::json!({
                    "workflow": workflow_name,
                    "trigger_context": context,
                    "sent_at": now,
                });
                let url_owned = url.to_string();
                let wf_name = workflow_name.to_string();
                // Fire-and-forget so leave/attendance APIs are not blocked by dead endpoints.
                std::thread::spawn(move || {
                    match reqwest::blocking::Client::new()
                        .post(&url_owned)
                        .header("Content-Type", "application/json")
                        .header("User-Agent", "Raintech-HRM-Workflow/1.0")
                        .json(&payload)
                        .timeout(std::time::Duration::from_secs(5))
                        .send()
                    {
                        Ok(resp) if resp.status().is_success() => {
                            log::info!(
                                "Workflow webhook [{}] POST {} -> {}",
                                wf_name,
                                url_owned,
                                resp.status()
                            );
                        }
                        Ok(resp) => {
                            log::warn!(
                                "Workflow '{}' webhook {} returned {}",
                                wf_name,
                                url_owned,
                                resp.status()
                            );
                        }
                        Err(e) => {
                            log::warn!(
                                "Workflow '{}' webhook {} failed: {}",
                                wf_name,
                                url_owned,
                                e
                            );
                        }
                    }
                });
                executed += 1;
            }
            "whatsapp" => {
                let message = action_field_str(&action, "message")
                    .or_else(|| action_field_str(&action, "body"))
                    .unwrap_or("Workflow notification");
                let recipient = resolve_assignee(conn, org_id, created_by, context, &action);
                let Some(uid) = recipient else {
                    skipped += 1;
                    continue;
                };
                let phone: Option<String> = conn
                    .query_row(
                        "SELECT phone FROM users WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
                        crate::params![uid, org_id],
                        |r| r.get_idx::<Option<String>>(0),
                    )
                    .ok()
                    .flatten()
                    .filter(|p| !p.trim().is_empty());
                let Some(phone) = phone else {
                    log::warn!(
                        "Workflow '{}' WhatsApp skipped — user {} has no phone",
                        workflow_name,
                        uid
                    );
                    skipped += 1;
                    continue;
                };
                if send_workflow_whatsapp(conn, org_id, &phone, message) {
                    executed += 1;
                } else {
                    skipped += 1;
                }
            }
            "notify_manager" => {
                let message = action_field_str(&action, "message")
                    .or_else(|| action_field_str(&action, "body"))
                    .unwrap_or("Workflow escalation");
                let subject_user = context
                    .get("user_id")
                    .or_else(|| context.get("employee_user_id"))
                    .and_then(|v| v.as_i64());
                let manager_id = subject_user.and_then(|uid| {
                    conn.query_row(
                        "SELECT COALESCE(reporting_manager_id, manager_id) FROM users
                         WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
                        crate::params![uid, org_id],
                        |r| r.get_idx::<Option<i64>>(0),
                    )
                    .ok()
                    .flatten()
                });
                let Some(manager_id) = manager_id.and_then(|m| org_scoped_user(conn, org_id, m))
                else {
                    log::warn!(
                        "Workflow '{}' notify_manager skipped — no manager for user {:?}",
                        workflow_name,
                        subject_user
                    );
                    skipped += 1;
                    continue;
                };
                let title = format!("Workflow: {}", workflow_name);
                if insert_org_notification(
                    conn,
                    org_id,
                    created_by,
                    &title,
                    message,
                    Some(manager_id),
                    now,
                ) {
                    if let Some(email) = crate::tenant_email::user_email(conn, manager_id) {
                        if crate::smtp_config::resolve(conn, org_id).is_some() {
                            let html = crate::tenant_email::render_base_template(
                                &title,
                                &format!(
                                    r#"<p style="margin:0;font-size:15px;line-height:1.6;color:#64748b;">{}</p>"#,
                                    crate::tenant_email::html_escape(message)
                                ),
                            );
                            crate::tenant_email::send_tenant_email(
                                conn,
                                org_id,
                                &email,
                                &title,
                                message.to_string(),
                                html,
                            );
                        }
                    }
                    executed += 1;
                } else {
                    skipped += 1;
                }
            }
            _ => {
                log::warn!(
                    "Workflow action '{}' in '{}' — not implemented (context: {})",
                    raw_type,
                    workflow_name,
                    context
                );
                skipped += 1;
            }
        }
    }
    (executed, skipped)
}

fn send_workflow_whatsapp(
    conn: &crate::db::Connection,
    org_id: i64,
    phone: &str,
    message: &str,
) -> bool {
    let auth_key: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE organization_id = ?1 AND key = 'msg91_auth_key'",
            crate::params![org_id],
            |r| r.get_idx::<Option<String>>(0),
        )
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            std::env::var("MSG91_AUTH_KEY")
                .or_else(|_| std::env::var("MSG91_AUTHKEY"))
                .ok()
                .filter(|s| !s.is_empty())
        });
    let Some(auth_key) = auth_key else {
        log::warn!("Workflow WhatsApp skipped — MSG91 not configured");
        return false;
    };
    let sender: String = conn
        .query_row(
            "SELECT value FROM app_settings WHERE organization_id = ?1 AND key = 'msg91_whatsapp_sender'",
            crate::params![org_id],
            |r| r.get_idx::<Option<String>>(0),
        )
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| phone.to_string());
    let phone_digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    let payload = serde_json::json!({
        "integrated_number": sender,
        "content_type": "text",
        "payload": {
            "to": phone_digits,
            "type": "text",
            "text": { "body": message }
        }
    });
    match reqwest::blocking::Client::new()
        .post("https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/")
        .header("authkey", &auth_key)
        .header("Content-Type", "application/json")
        .json(&payload)
        .timeout(std::time::Duration::from_secs(15))
        .send()
    {
        Ok(r) if r.status().is_success() => true,
        Ok(r) => {
            log::warn!("Workflow WhatsApp MSG91 status {}", r.status());
            false
        }
        Err(e) => {
            log::warn!("Workflow WhatsApp failed: {e}");
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trigger_type_variants_leave_approved() {
        let v = trigger_type_variants("leave_approved");
        assert!(v.contains(&"leave_request_approved".to_string()));
    }

    #[test]
    fn conditions_object_equals() {
        let cond = serde_json::json!({"leave_type": "annual"});
        let ctx = serde_json::json!({"leave_type": "annual", "user_id": 1});
        assert!(conditions_match(&cond, &ctx));
    }

    #[test]
    fn conditions_array_rule_fails_on_mismatch() {
        let cond = serde_json::json!([
            {"field": "leave_type", "operator": "equals", "value": "sick"}
        ]);
        let ctx = serde_json::json!({"leave_type": "annual"});
        assert!(!conditions_match(&cond, &ctx));
    }

    #[test]
    fn numeric_gte_operator() {
        let rule = serde_json::json!({"field": "days_count", "operator": "gte", "value": 2});
        let ctx = serde_json::json!({"days_count": 3});
        assert!(evaluate_rule(&rule, &ctx));
    }

    #[test]
    fn contains_operator() {
        let rule = serde_json::json!({"field": "reason", "operator": "contains", "value": "urgent"});
        let ctx = serde_json::json!({"reason": "urgent medical"});
        assert!(evaluate_rule(&rule, &ctx));
    }

    #[test]
    fn normalize_ui_create_task_action() {
        let ui = serde_json::json!([{"type": "create_task", "config": {"title": "My task", "due_days": 3}}]);
        let norm = normalize_workflow_actions(&ui);
        let item = norm.as_array().unwrap().first().unwrap();
        assert_eq!(item.get("type").and_then(|v| v.as_str()), Some("create_task"));
        assert_eq!(item.get("title").and_then(|v| v.as_str()), Some("My task"));
        assert_eq!(item.get("due_days").and_then(|v| v.as_i64()), Some(3));
    }

    #[test]
    fn normalize_send_notification_alias() {
        let ui = serde_json::json!([{"type": "send_notification", "config": {"message": "Hello"}}]);
        let norm = normalize_workflow_actions(&ui);
        assert_eq!(
            norm[0].get("type").and_then(|v| v.as_str()),
            Some("notification")
        );
        assert_eq!(
            norm[0].get("message").and_then(|v| v.as_str()),
            Some("Hello")
        );
    }
}

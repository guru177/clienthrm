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
        other => vec![other.to_string()],
    }
}

pub fn trigger(
    conn: &crate::db::Connection,
    org_id: i64,
    trigger_type: &str,
    context: &serde_json::Value,
) {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let variants = trigger_type_variants(trigger_type);

    let mut workflows: Vec<(i64, String, Option<String>, Option<String>)> = Vec::new();
    for variant in variants {
        let mut stmt = match conn.prepare(
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

    let created_by = context
        .get("approved_by")
        .or_else(|| context.get("created_by"))
        .or_else(|| context.get("rejected_by"))
        .and_then(|v| v.as_i64())
        .and_then(|uid| org_scoped_user(conn, org_id, uid));

    for (workflow_id, name, conditions_json, actions_json) in workflows {
        if let Some(ref conditions_str) = conditions_json {
            if !conditions_str.trim().is_empty() {
                match serde_json::from_str::<serde_json::Value>(conditions_str) {
                    Ok(conditions) => {
                        if !conditions_match(&conditions, context) {
                            log::info!(
                                "Workflow '{}' (id={}) skipped — trigger conditions not met",
                                name,
                                workflow_id
                            );
                            continue;
                        }
                    }
                    Err(e) => {
                        log::warn!(
                            "Workflow '{}' (id={}) skipped — invalid trigger_conditions: {}",
                            name,
                            workflow_id,
                            e
                        );
                        continue;
                    }
                }
            }
        }

        let execution_id = conn
            .execute(
                "INSERT INTO workflow_executions (workflow_id, status, trigger_type, created_at, updated_at)
                 VALUES (?1, 'running', ?2, ?3, ?3)",
                crate::params![workflow_id, trigger_type, &now],
            )
            .map(|_| conn.last_insert_rowid());

        if let Some(ref actions_str) = actions_json {
            if let Ok(actions) = serde_json::from_str::<serde_json::Value>(actions_str) {
                let (executed, skipped) = if let Some(actor) = created_by {
                    execute_actions(conn, org_id, actor, &name, &actions, context, &now)
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
                continue;
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
        let action_type = action
            .get("type")
            .or_else(|| action.get("action"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        match action_type {
            "create_task" | "task" => {
                let title = action
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Workflow task");
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
                if conn
                    .execute(
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
                    .is_ok()
                {
                    executed += 1;
                } else {
                    skipped += 1;
                }
            }
            "notify" | "notification" | "log" => {
                let message = action
                    .get("message")
                    .or_else(|| action.get("body"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Workflow notification");
                let recipient = resolve_assignee(conn, org_id, created_by, context, &action);
                log::info!(
                    "Workflow notify [{}] to user {:?}: {} — context: {}",
                    workflow_name,
                    recipient,
                    message,
                    context
                );
                executed += 1;
                if action
                    .get("create_task")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
                {
                    let Some(recipient) =
                        resolve_assignee(conn, org_id, created_by, context, &action)
                    else {
                        skipped += 1;
                        continue;
                    };
                    if conn
                        .execute(
                            "INSERT INTO tasks (title, description, status, priority, assigned_to, created_by, organization_id, created_at, updated_at)
                         VALUES (?1, ?2, 'todo', 'low', ?3, ?4, ?5, ?6, ?6)",
                            crate::params![
                                format!("{}: {}", workflow_name, message),
                                format!("Notification from workflow. Context: {}", context),
                                recipient,
                                created_by,
                                org_id,
                                now,
                            ],
                        )
                        .is_ok()
                    {
                        executed += 1;
                    } else {
                        skipped += 1;
                    }
                }
            }
            _ => {
                log::info!(
                    "Workflow action '{}' in '{}' — context: {}",
                    action_type,
                    workflow_name,
                    context
                );
                executed += 1;
            }
        }
    }
    (executed, skipped)
}

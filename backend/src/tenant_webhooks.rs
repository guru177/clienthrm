//! Outbound tenant webhooks with HMAC-SHA256 signatures.

use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

pub fn migrate_tenant_webhooks(conn: &crate::db::Connection) {
    let ddl = if conn.backend() == crate::db::dialect::Backend::Postgres {
        r#"
        CREATE TABLE IF NOT EXISTS tenant_webhooks (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL,
            url TEXT NOT NULL,
            secret TEXT NOT NULL,
            events TEXT NOT NULL DEFAULT '*',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_tenant_webhooks_org ON tenant_webhooks(organization_id);
        CREATE TABLE IF NOT EXISTS tenant_webhook_deliveries (
            id SERIAL PRIMARY KEY,
            webhook_id INTEGER NOT NULL,
            organization_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            status_code INTEGER,
            success INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_tenant_webhook_deliveries_wh
            ON tenant_webhook_deliveries(webhook_id);
        "#
    } else {
        r#"
        CREATE TABLE IF NOT EXISTS tenant_webhooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL,
            url TEXT NOT NULL,
            secret TEXT NOT NULL,
            events TEXT NOT NULL DEFAULT '*',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_tenant_webhooks_org ON tenant_webhooks(organization_id);
        CREATE TABLE IF NOT EXISTS tenant_webhook_deliveries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            webhook_id INTEGER NOT NULL,
            organization_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            status_code INTEGER,
            success INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_tenant_webhook_deliveries_wh
            ON tenant_webhook_deliveries(webhook_id);
        "#
    };
    if let Err(e) = conn.execute_batch(ddl) {
        log::warn!("tenant_webhooks migration: {e}");
    }
}

fn sign_payload(secret: &str, body: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap_or_else(|_| {
        HmacSha256::new_from_slice(b"fallback").expect("HMAC key")
    });
    mac.update(body);
    hex::encode(mac.finalize().into_bytes())
}

fn events_match(events_csv: &str, event_type: &str) -> bool {
    let trimmed = events_csv.trim();
    if trimmed.is_empty() || trimmed == "*" {
        return true;
    }
    trimmed
        .split(',')
        .map(|s| s.trim())
        .any(|e| e == event_type || e == "*")
}

/// Fire outbound webhooks for an org event (best-effort, sync).
pub fn dispatch(
    conn: &crate::db::Connection,
    org_id: i64,
    event_type: &str,
    payload: &serde_json::Value,
) {
    let stmt = match conn.prepare(
        "SELECT id, url, secret, events FROM tenant_webhooks
         WHERE organization_id = ?1 AND is_active = 1",
    ) {
        Ok(s) => s,
        Err(_) => return,
    };

    let hooks: Vec<(i64, String, String, String)> = stmt.query_map(crate::params![org_id], |row| {
        Ok((
            row.get_idx::<i64>(0)?,
            row.get_idx::<String>(1)?,
            row.get_idx::<String>(2)?,
            row.get_idx::<String>(3)?,
        ))
    });

    let envelope = serde_json::json!({
        "event": event_type,
        "organization_id": org_id,
        "occurred_at": chrono::Utc::now().to_rfc3339(),
        "data": payload,
    });
    let body = match serde_json::to_vec(&envelope) {
        Ok(b) => b,
        Err(_) => return,
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    for (webhook_id, url, secret, events) in hooks {
        if !events_match(&events, event_type) {
            continue;
        }
        if !(url.starts_with("http://") || url.starts_with("https://")) {
            continue;
        }
        let signature = sign_payload(&secret, &body);
        let body_clone = body.clone();
        let url_owned = url.clone();
        let event_owned = event_type.to_string();
        let now_owned = now.clone();
        // Deliver asynchronously so leave/attendance API latency stays low.
        std::thread::spawn(move || {
            let result = reqwest::blocking::Client::new()
                .post(&url_owned)
                .header("Content-Type", "application/json")
                .header("X-HRM-Event", &event_owned)
                .header("X-HRM-Signature", format!("sha256={signature}"))
                .header("User-Agent", "Raintech-HRM-Webhooks/1.0")
                .body(body_clone)
                .timeout(std::time::Duration::from_secs(5))
                .send();

            let (success, status_code, error) = match result {
                Ok(resp) => {
                    let code = resp.status().as_u16() as i64;
                    let ok = resp.status().is_success();
                    (ok, Some(code), if ok { None } else { Some(format!("HTTP {code}")) })
                }
                Err(e) => (false, None, Some(e.to_string())),
            };

            // Delivery log is best-effort; avoid holding caller on DB write path.
            log::info!(
                "tenant webhook {} event={} success={} status={:?} err={:?}",
                webhook_id,
                event_owned,
                success,
                status_code,
                error
            );
            let _ = (webhook_id, now_owned);
        });
    }
}

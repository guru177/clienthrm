//! Resolve SMTP settings: org app_settings override, then `.env` defaults.

use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};

#[derive(Clone)]
pub struct SmtpConfig {
    pub host: String,
    pub user: String,
    pub pass: String,
    pub port: u16,
    pub from_address: String,
    pub from_name: Option<String>,
    encryption: Encryption,
}

#[derive(Clone, Copy)]
enum Encryption {
    Tls,
    Ssl,
    None,
}

fn read_app_setting(conn: &crate::db::Connection, org_id: i64, keys: &[&str]) -> Option<String> {
    for key in keys {
        let val: Result<String, _> = conn.query_row(
            "SELECT value FROM app_settings WHERE organization_id = ?1 AND key = ?2",
            crate::params![org_id, key],
            |row| row.get_idx::<String>(0),
        );
        if let Ok(v) = val {
            if !v.is_empty() && v != "********" {
                return Some(v);
            }
        }
    }
    None
}

fn read_env(keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Ok(v) = std::env::var(key) {
            if !v.is_empty() {
                return Some(v);
            }
        }
    }
    None
}

fn resolve_field(
    conn: Option<&crate::db::Connection>,
    org_id: Option<i64>,
    app_keys: &[&str],
    env_keys: &[&str],
) -> String {
    if let (Some(conn), Some(org_id)) = (conn, org_id) {
        if let Some(v) = read_app_setting(conn, org_id, app_keys) {
            return v;
        }
    }
    read_env(env_keys).unwrap_or_default()
}

fn parse_encryption(raw: &str) -> Encryption {
    match raw.trim().to_lowercase().as_str() {
        "ssl" => Encryption::Ssl,
        "tls" => Encryption::Tls,
        "null" | "none" => Encryption::None,
        "" => Encryption::Tls,
        _ => Encryption::Tls,
    }
}

/// Split `Name <email@x>` or return bare address.
fn parse_from_address(raw: &str) -> (String, Option<String>) {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return (String::new(), None);
    }
    if let (Some(lt), Some(gt)) = (trimmed.find('<'), trimmed.rfind('>')) {
        if lt < gt {
            let email = trimmed[lt + 1..gt].trim().to_string();
            let name = trimmed[..lt].trim().trim_matches('"').to_string();
            if !email.is_empty() {
                return (
                    email,
                    if name.is_empty() { None } else { Some(name) },
                );
            }
        }
    }
    (trimmed.to_string(), None)
}

/// Org app settings (mail_* / smtp_*) with fallback to environment variables.
pub fn resolve(conn: &crate::db::Connection, org_id: i64) -> Option<SmtpConfig> {
    build_config(Some(conn), Some(org_id))
}

/// Environment-only SMTP (signup OTP, platform mail, etc.).
pub fn resolve_from_env() -> Option<SmtpConfig> {
    build_config(None, None)
}

fn build_config(
    conn: Option<&crate::db::Connection>,
    org_id: Option<i64>,
) -> Option<SmtpConfig> {
    let host = resolve_field(
        conn,
        org_id,
        &["mail_host", "smtp_host"],
        &["SMTP_HOST"],
    );
    if host.is_empty() {
        return None;
    }

    let user = resolve_field(
        conn,
        org_id,
        &["mail_username", "smtp_user"],
        &["SMTP_USER"],
    );
    let pass = resolve_field(
        conn,
        org_id,
        &["mail_password", "smtp_pass"],
        &["SMTP_PASS", "SMTP_PASSWORD"],
    );

    let port_str = resolve_field(
        conn,
        org_id,
        &["mail_port", "smtp_port"],
        &["SMTP_PORT"],
    );
    let port = if port_str.is_empty() {
        587
    } else {
        port_str.parse().unwrap_or(587)
    };

    let mut from_address = resolve_field(
        conn,
        org_id,
        &["mail_from_address", "smtp_from"],
        &["SMTP_FROM"],
    );
    let (parsed_addr, parsed_name) = parse_from_address(&from_address);
    from_address = parsed_addr;
    if from_address.is_empty() {
        from_address = user.clone();
    }
    if from_address.is_empty() {
        from_address = "no-reply@example.com".to_string();
    }

    let from_name = {
        let name = resolve_field(conn, org_id, &["mail_from_name"], &["SMTP_FROM_NAME"]);
        if !name.is_empty() {
            Some(name)
        } else {
            parsed_name
        }
    };

    let encryption_raw = resolve_field(
        conn,
        org_id,
        &["mail_encryption", "smtp_encryption"],
        &["SMTP_ENCRYPTION", "MAIL_ENCRYPTION"],
    );
    let encryption = parse_encryption(&encryption_raw);

    Some(SmtpConfig {
        host,
        user,
        pass,
        port,
        from_address,
        from_name,
        encryption,
    })
}

impl SmtpConfig {
    pub fn from_mailbox(&self) -> Result<Mailbox, String> {
        if let Some(name) = &self.from_name {
            format!("{name} <{}>", self.from_address)
                .parse()
                .map_err(|_| "Invalid mail from name/address".to_string())
        } else {
            self.from_address
                .parse()
                .map_err(|_| "Invalid mail from address".to_string())
        }
    }

    pub fn send(&self, message: &Message) -> Result<(), String> {
        let use_auth = !self.user.trim().is_empty() && !self.pass.trim().is_empty();
        let mailer = if matches!(self.encryption, Encryption::Ssl) || self.port == 465 {
            let builder = SmtpTransport::relay(&self.host)
                .map_err(|e| format!("SMTP relay error: {e}"))?
                .port(self.port);
            if use_auth {
                builder
                    .credentials(Credentials::new(self.user.clone(), self.pass.clone()))
                    .build()
            } else {
                builder.build()
            }
        } else if matches!(self.encryption, Encryption::None) {
            // Local catchers (Mailpit/MailHog) — plain SMTP, usually no auth.
            let builder = SmtpTransport::builder_dangerous(&self.host).port(self.port);
            if use_auth {
                builder
                    .credentials(Credentials::new(self.user.clone(), self.pass.clone()))
                    .build()
            } else {
                builder.build()
            }
        } else {
            let builder = SmtpTransport::starttls_relay(&self.host)
                .map_err(|e| format!("SMTP relay error: {e}"))?
                .port(self.port);
            if use_auth {
                builder
                    .credentials(Credentials::new(self.user.clone(), self.pass.clone()))
                    .build()
            } else {
                builder.build()
            }
        };

        mailer
            .send(message)
            .map(|_| ())
            .map_err(|e| format!("SMTP send failed: {e}"))
    }
}

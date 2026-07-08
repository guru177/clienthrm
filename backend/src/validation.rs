use chrono::NaiveDate;

/// Trim and reject empty required text fields.
pub fn require_non_empty(value: &str, field: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(format!("{field} is required"))
    } else {
        Ok(trimmed.to_string())
    }
}

/// Trim and enforce a minimum length (after trim).
pub fn require_min_len(value: &str, min: usize, field: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.len() < min {
        Err(format!("{field} must be at least {min} characters"))
    } else {
        Ok(trimmed.to_string())
    }
}

/// Aligns with tenant UI: `^[^\s@]+@[^\s@]+\.[^\s@]+$`
pub fn validate_email(value: &str) -> Result<String, String> {
    let email = value.trim().to_lowercase();
    if email.is_empty() {
        return Err("A valid email is required".to_string());
    }
    let parts: Vec<&str> = email.split('@').collect();
    if parts.len() != 2 {
        return Err("A valid email is required".to_string());
    }
    let local = parts[0];
    let domain = parts[1];
    if local.is_empty()
        || domain.is_empty()
        || local.contains(' ')
        || domain.contains(' ')
        || !domain.contains('.')
    {
        return Err("A valid email is required".to_string());
    }
    if domain.split('.').any(str::is_empty) {
        return Err("A valid email is required".to_string());
    }
    Ok(email)
}

pub fn validate_date_yyyy_mm_dd(value: &str, field: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{field} is required"));
    }
    NaiveDate::parse_from_str(trimmed, "%Y-%m-%d")
        .map(|_| trimmed.to_string())
        .map_err(|_| format!("{field} must be a valid date (YYYY-MM-DD)"))
}

/// Empty or whitespace-only strings become `None` for optional DB columns.
pub fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn require_non_empty_rejects_blank() {
        assert!(require_non_empty("  ", "name").is_err());
        assert_eq!(require_non_empty("  Alice  ", "name").unwrap(), "Alice");
    }

    #[test]
    fn require_min_len_enforces_minimum() {
        assert!(require_min_len("ab", 3, "password").is_err());
        assert_eq!(require_min_len("  abc  ", 3, "password").unwrap(), "abc");
    }

    #[test]
    fn validate_email_accepts_valid_and_rejects_invalid() {
        assert_eq!(
            validate_email("User@Example.COM").unwrap(),
            "user@example.com"
        );
        assert!(validate_email("").is_err());
        assert!(validate_email("not-an-email").is_err());
        assert!(validate_email("@missing.local").is_err());
        assert!(validate_email("spaces @x.com").is_err());
    }

    #[test]
    fn validate_date_requires_yyyy_mm_dd() {
        assert_eq!(
            validate_date_yyyy_mm_dd("2026-01-15", "start").unwrap(),
            "2026-01-15"
        );
        assert!(validate_date_yyyy_mm_dd("", "start").is_err());
        assert!(validate_date_yyyy_mm_dd("15-01-2026", "start").is_err());
    }

    #[test]
    fn normalize_optional_trims_and_drops_empty() {
        assert_eq!(normalize_optional(None), None);
        assert_eq!(normalize_optional(Some("  ".into())), None);
        assert_eq!(normalize_optional(Some("  hi ".into())), Some("hi".into()));
    }
}

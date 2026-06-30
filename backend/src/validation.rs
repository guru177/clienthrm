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

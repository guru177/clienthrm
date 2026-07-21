#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Backend {
    Sqlite,
    Postgres,
}

/// Adapt SQLite-style SQL for PostgreSQL when needed.
pub fn adapt_sql(sql: &str, backend: Backend) -> String {
    match backend {
        Backend::Sqlite => sql.to_string(),
        Backend::Postgres => adapt_postgres(sql),
    }
}

fn adapt_postgres(sql: &str) -> String {
    let upper = sql.to_ascii_uppercase();
    let had_insert_ignore = upper.contains("INSERT OR IGNORE");

    let mut out = sql.to_string();
    // SQLite `datetime('now', '-15 minutes')` / `datetime(col)` → Postgres equivalents.
    out = rewrite_func_calls(&out, "datetime", build_datetime_pg);
    // SQLite `GROUP_CONCAT(expr[, sep])` → Postgres `STRING_AGG`.
    out = rewrite_func_calls(&out, "group_concat", build_group_concat_pg);
    out = replace_all_ci(&out, "INSERT OR IGNORE INTO", "INSERT INTO");

    if had_insert_ignore && !out.to_ascii_uppercase().contains("ON CONFLICT") {
        let trimmed = out.trim().trim_end_matches(';');
        out = format!("{trimmed} ON CONFLICT DO NOTHING");
    }

    if !out.contains('?') {
        return out;
    }

    let has_numbered = out.as_bytes().windows(2).any(|w| w[0] == b'?' && w[1].is_ascii_digit());

    if has_numbered {
        out = convert_placeholders(&out);
        if out.contains('?') {
            out = convert_remaining_qmark_placeholders(&out);
        }
    } else {
        out = convert_qmark_placeholders(&out);
    }
    out
}

/// Convert leftover `?` after `?1`/`?2` style placeholders (e.g. `LIMIT ? OFFSET ?`).
fn convert_remaining_qmark_placeholders(sql: &str) -> String {
    let mut n = max_postgres_placeholder(sql) + 1;
    let mut out = String::with_capacity(sql.len());
    for ch in sql.chars() {
        if ch == '?' {
            out.push('$');
            out.push_str(&n.to_string());
            n += 1;
        } else {
            out.push(ch);
        }
    }
    out
}

fn max_postgres_placeholder(sql: &str) -> usize {
    let bytes = sql.as_bytes();
    let mut i = 0;
    let mut max = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'$' {
            i += 1;
            let start = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            if i > start {
                if let Ok(num) = sql[start..i].parse::<usize>() {
                    max = max.max(num);
                }
            }
            continue;
        }
        i += 1;
    }
    max
}

/// Rewrite every `fname(...)` call in `sql` using `f` applied to its top-level args.
/// `f` must never produce another `fname(` token (would loop forever).
fn rewrite_func_calls<F: Fn(&[String]) -> String>(sql: &str, fname: &str, f: F) -> String {
    let mut result = sql.to_string();
    loop {
        let lower = result.to_ascii_lowercase();
        let Some(start) = find_call(&lower, fname) else {
            break;
        };
        let open = start + fname.len();
        let Some(close) = matching_paren(&result, open) else {
            break;
        };
        let inner = result[open + 1..close].to_string();
        let args = split_top_level_args(&inner);
        let replacement = f(&args);
        result.replace_range(start..close + 1, &replacement);
    }
    result
}

/// Find `fname(` not preceded by an identifier char (so `update_datetime(` is skipped).
fn find_call(sql_lower: &str, fname: &str) -> Option<usize> {
    let needle = format!("{fname}(");
    let mut search = 0;
    while let Some(rel) = sql_lower[search..].find(&needle) {
        let pos = search + rel;
        let ok_before = pos == 0 || {
            let pc = sql_lower.as_bytes()[pos - 1];
            !pc.is_ascii_alphanumeric() && pc != b'_'
        };
        if ok_before {
            return Some(pos);
        }
        search = pos + needle.len();
    }
    None
}

/// Index of the `)` matching the `(` at `open` (quote- and nesting-aware).
fn matching_paren(s: &str, open: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth = 0i32;
    let mut in_str = false;
    let mut i = open;
    while i < bytes.len() {
        let c = bytes[i];
        if in_str {
            if c == b'\'' {
                if i + 1 < bytes.len() && bytes[i + 1] == b'\'' {
                    i += 2;
                    continue;
                }
                in_str = false;
            }
        } else {
            match c {
                b'\'' => in_str = true,
                b'(' => depth += 1,
                b')' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(i);
                    }
                }
                _ => {}
            }
        }
        i += 1;
    }
    None
}

/// Split `a, b, c` honoring quotes and nested parens.
fn split_top_level_args(inner: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut depth = 0i32;
    let mut in_str = false;
    let mut cur = String::new();
    let bytes = inner.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if in_str {
            cur.push(c);
            if c == '\'' {
                if i + 1 < bytes.len() && bytes[i + 1] == b'\'' {
                    cur.push('\'');
                    i += 2;
                    continue;
                }
                in_str = false;
            }
        } else {
            match c {
                '\'' => {
                    in_str = true;
                    cur.push(c);
                }
                '(' => {
                    depth += 1;
                    cur.push(c);
                }
                ')' => {
                    depth -= 1;
                    cur.push(c);
                }
                ',' if depth == 0 => {
                    args.push(cur.trim().to_string());
                    cur.clear();
                }
                _ => cur.push(c),
            }
        }
        i += 1;
    }
    if !args.is_empty() || !cur.trim().is_empty() {
        args.push(cur.trim().to_string());
    }
    args
}

/// `datetime('now', '-15 minutes')` → UTC text timestamp (matches TEXT columns / SQLite style),
/// `datetime(col)` → `(col)` (ISO-8601 text sorts chronologically).
fn build_datetime_pg(args: &[String]) -> String {
    if args.is_empty() {
        return "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')".to_string();
    }
    let first = args[0].trim();
    let first_unquoted = first.trim_matches('\'').trim();
    if first_unquoted.eq_ignore_ascii_case("now") {
        let mut expr = "CURRENT_TIMESTAMP".to_string();
        for m in &args[1..] {
            let modi = m.trim().trim_matches('\'').trim();
            if let Some(rest) = modi.strip_prefix('-') {
                expr = format!("({} - INTERVAL '{}')", expr, rest.trim());
            } else if let Some(rest) = modi.strip_prefix('+') {
                expr = format!("({} + INTERVAL '{}')", expr, rest.trim());
            }
            // Unsupported modifiers (e.g. 'localtime', 'start of day') are ignored.
        }
        // Emit UTC text so `TEXT_col >= datetime('now', …)` works on Postgres.
        format!("to_char(({expr}) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')")
    } else {
        format!("({first})")
    }
}

/// `GROUP_CONCAT(expr[, sep])` → `STRING_AGG(CAST(expr AS TEXT), sep)`.
fn build_group_concat_pg(args: &[String]) -> String {
    if args.is_empty() {
        return "STRING_AGG('', ',')".to_string();
    }
    let expr = args[0].trim();
    let sep = args
        .get(1)
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "','".to_string());
    format!("STRING_AGG(CAST({expr} AS TEXT), {sep})")
}

fn replace_all_ci(haystack: &str, from: &str, to: &str) -> String {
    let mut result = haystack.to_string();
    let from_lower = from.to_ascii_lowercase();
    while let Some(pos) = result.to_ascii_lowercase().find(&from_lower) {
        result.replace_range(pos..pos + from.len(), to);
    }
    result
}

/// Convert bare `?` placeholders to `$1`, `$2`, … (dynamic SQL).
fn convert_qmark_placeholders(sql: &str) -> String {
    let mut out = String::with_capacity(sql.len());
    let mut n = 1usize;
    for ch in sql.chars() {
        if ch == '?' {
            out.push('$');
            out.push_str(&n.to_string());
            n += 1;
        } else {
            out.push(ch);
        }
    }
    out
}

/// Convert `?1`, `?2`, … placeholders to `$1`, `$2`, …
pub fn convert_placeholders(sql: &str) -> String {
    let mut out = String::with_capacity(sql.len());
    let bytes = sql.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'?' && i + 1 < bytes.len() && bytes[i + 1].is_ascii_digit() {
            let start = i + 1;
            let mut j = start;
            while j < bytes.len() && bytes[j].is_ascii_digit() {
                j += 1;
            }
            out.push('$');
            out.push_str(&sql[start..j]);
            i = j;
        } else {
            out.push(bytes[i] as char);
            i += 1;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_placeholders() {
        assert_eq!(
            convert_placeholders("SELECT * FROM users WHERE id = ?1 AND org = ?2"),
            "SELECT * FROM users WHERE id = $1 AND org = $2"
        );
    }

    #[test]
    fn replaces_all_datetime_now() {
        let sql = "INSERT INTO t (a, b) VALUES (datetime('now'), datetime('now'))";
        let pg = adapt_postgres(sql);
        assert!(!pg.contains("datetime('now')"));
        assert!(pg.contains("to_char"));
        assert_eq!(pg.matches("YYYY-MM-DD HH24:MI:SS").count(), 2);
    }

    #[test]
    fn rewrites_datetime_modifier() {
        let pg = adapt_postgres("SELECT * FROM p WHERE a >= datetime('now', '-15 minutes')");
        assert_eq!(
            pg,
            "SELECT * FROM p WHERE a >= to_char(((CURRENT_TIMESTAMP - INTERVAL '15 minutes')) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')"
        );
    }

    #[test]
    fn rewrites_datetime_of_column() {
        let pg = adapt_postgres("SELECT x FROM p ORDER BY datetime(bp.punch_time) DESC");
        assert_eq!(pg, "SELECT x FROM p ORDER BY (bp.punch_time) DESC");
    }

    #[test]
    fn rewrites_group_concat() {
        let pg = adapt_postgres("SELECT emoji, GROUP_CONCAT(user_id) FROM r GROUP BY emoji");
        assert_eq!(
            pg,
            "SELECT emoji, STRING_AGG(CAST(user_id AS TEXT), ',') FROM r GROUP BY emoji"
        );
    }

    #[test]
    fn presence_update_placeholders() {
        let sql = "UPDATE user_presence SET ip_address = ?2, organization_id = ?3, last_active_at = ?4, updated_at = ?5 WHERE user_id = ?1";
        let pg = adapt_postgres(sql);
        assert_eq!(
            pg,
            "UPDATE user_presence SET ip_address = $2, organization_id = $3, last_active_at = $4, updated_at = $5 WHERE user_id = $1"
        );
    }

    #[test]
    fn mixed_numbered_and_bare_limit_offset() {
        let sql = "SELECT * FROM designations d WHERE d.organization_id = ?1 ORDER BY d.name ASC LIMIT ? OFFSET ?";
        let pg = adapt_postgres(sql);
        assert_eq!(
            pg,
            "SELECT * FROM designations d WHERE d.organization_id = $1 ORDER BY d.name ASC LIMIT $2 OFFSET $3"
        );
    }

    #[test]
    fn department_list_sql_with_subquery_and_pagination() {
        let sql = "SELECT d.*,\n                (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.organization_id = d.organization_id) AS users_count\n         FROM departments d\n         WHERE d.organization_id = ?1 ORDER BY d.created_at DESC LIMIT ? OFFSET ?";
        let pg = adapt_postgres(sql);
        assert!(
            pg.contains("LIMIT $2 OFFSET $3"),
            "unexpected adapted SQL: {pg}"
        );
        assert!(
            !pg.contains('?'),
            "leftover placeholders: {pg}"
        );
    }
}

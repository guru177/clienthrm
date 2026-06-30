use actix_web::{web, Error, HttpRequest, HttpResponse};
use actix_web::error::ErrorUnauthorized;
use actix_ws::Message;
use futures_util::StreamExt as _;
use std::sync::Arc;

use crate::biometric_events::BiometricEvents;
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::user::JwtClaims;
use crate::models::{ApiError, ApiResponse};
use crate::models::biometric::{BiometricDevice, IClockQuery, UserMapRequest};
use crate::tenant::org_id_from_claims;

fn peer_ip(req: &HttpRequest) -> String {
    req.headers()
        .get("X-Forwarded-For")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| req.peer_addr().map(|a| a.ip().to_string()))
        .unwrap_or_default()
}

/// When BIOMETRIC_STRICT_IP=1, reject punches from IPs that differ from registered device IP.
fn device_ip_allowed(conn: &crate::db::Connection, sn: &str, ip: &str) -> bool {
    crate::biometric_device_logic::device_ip_allowed(conn, sn, ip)
}

fn take_pending_command(conn: &crate::db::Connection, sn: &str) -> Option<String> {
    let (cmd_id, command): (i64, String) = conn
        .query_row(
            "SELECT id, command FROM biometric_commands WHERE device_serial=?1 AND status='pending' ORDER BY id LIMIT 1",
            crate::params![sn],
            |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<String>(1)?)),
        )
        .ok()?;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "UPDATE biometric_commands SET status='sent', executed_at=?1 WHERE id=?2",
        crate::params![&now, cmd_id],
    );
    log::info!("📤 [BIOMETRIC] Sending command to SN={}: {}", sn, command);
    Some(format!("C:{cmd_id}:{command}"))
}

/// Update device heartbeat and push a live event to connected admin browsers.
fn record_device_touch(
    conn: &crate::db::Connection,
    events: &BiometricEvents,
    sn: &str,
    ip: &str,
    event_kind: &str,
) {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let updated = conn
        .execute(
            "UPDATE biometric_devices
             SET ip_address = ?1, last_heartbeat = ?2, is_active = 1, updated_at = ?2
             WHERE serial_number = ?3",
            crate::params![ip, &now, sn],
        )
        .unwrap_or(0);
    if updated == 0 {
        log::warn!(
            "Biometric device SN={} sent heartbeat but is not registered to an organization",
            sn
        );
        return;
    }

    let org_id: Option<i64> = conn
        .query_row(
            "SELECT organization_id FROM biometric_devices WHERE serial_number = ?1",
            [sn],
            |row| row.get_idx::<i64>(0),
        )
        .ok();

    events.emit(
        event_kind,
        serde_json::json!({
            "serial_number": sn,
            "ip_address": ip,
            "last_heartbeat": now,
            "organization_id": org_id,
        }),
    );
}

struct AttlogLine {
    pin: String,
    timestamp: String,
    status: i64,
    verify: i64,
}

/// Parse tab-separated ATTLOG body and sort chronologically (devices often upload out of order).
fn parse_attlog_lines(body: &str) -> Vec<AttlogLine> {
    let mut lines = Vec::new();
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() < 2 {
            continue;
        }
        let pin = fields[0].trim().to_string();
        let timestamp = fields.get(1).map(|s| s.trim()).unwrap_or("").to_string();
        if pin.is_empty() || timestamp.is_empty() {
            continue;
        }
        let status: i64 = fields
            .get(2)
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0);
        let verify: i64 = fields
            .get(3)
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0);
        lines.push(AttlogLine {
            pin,
            timestamp,
            status,
            verify,
        });
    }
    lines.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    lines
}

/// Normalize device timestamps so sorting and duplicate checks are reliable.
pub(crate) fn normalize_punch_timestamp(timestamp: &str) -> String {
    let trimmed = timestamp.trim();
    for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S%.f"] {
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(trimmed, fmt) {
            return dt.format("%Y-%m-%d %H:%M:%S").to_string();
        }
    }
    trimmed.to_string()
}

/// Insert a punch row. Unmapped PINs are stored (user_id NULL) for the Punch Log.
/// Returns true when a new row was inserted.
pub(crate) fn store_incoming_punch(
    conn: &crate::db::Connection,
    sn: &str,
    pin: &str,
    timestamp: &str,
    status: i64,
    verify: i64,
    now: &str,
) -> bool {
    let timestamp = normalize_punch_timestamp(timestamp);
    let user_id: Option<i64> = conn
        .query_row(
            "SELECT bm.user_id
             FROM biometric_user_map bm
             INNER JOIN users u ON u.id = bm.user_id AND u.deleted_at IS NULL
             INNER JOIN biometric_devices bd
                ON bd.serial_number = bm.device_serial
               AND bd.organization_id = u.organization_id
             WHERE bm.device_serial = ?1 AND bm.device_pin = ?2",
            crate::params![sn, pin],
            |row| row.get_idx::<i64>(0),
        )
        .ok();

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM biometric_punches WHERE device_serial=?1 AND device_pin=?2 AND punch_time=?3",
            crate::params![sn, pin, &timestamp],
            |row| row.get_idx::<i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if exists {
        log::info!("  ⏭️  Duplicate punch skipped: PIN={} Time={}", pin, &timestamp);
        return false;
    }

    let punch_type = resolve_effective_punch_type(conn, user_id, sn, pin, status, &timestamp, verify);
    if punch_type != status {
        log::info!(
            "  🔄 Resolved punch type {} → {} for PIN={} (device sent status={})",
            status,
            punch_type,
            pin,
            status
        );
    }

    if conn
        .execute(
            "INSERT INTO biometric_punches (device_serial, device_pin, punch_time, punch_type, verify_method, user_id, is_processed, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
            crate::params![sn, pin, &timestamp, punch_type, verify, user_id, now],
        )
        .is_err()
    {
        return false;
    }

    let punch_id = conn.last_insert_rowid();
    if let Some(uid) = user_id {
        process_punch_to_attendance(conn, punch_id, uid, &timestamp, punch_type);
    } else {
        log::info!(
            "  📋 Stored unmapped punch PIN={} on SN={} — map PIN in Admin → Biometric",
            pin,
            sn
        );
    }
    true
}

// ═══════════════════════════════════════════════════════════════════
//  iClock / ADMS Protocol Endpoints (No Auth — Device-to-Server)
// ═══════════════════════════════════════════════════════════════════

/// GET /iclock/cdata — Device handshake / registration
/// The biometric device calls this on boot and periodically (heartbeat).
pub async fn iclock_handshake(
    pool: web::Data<DbPool>,
    events: web::Data<BiometricEvents>,
    query: web::Query<IClockQuery>,
    req: HttpRequest,
) -> HttpResponse {
    let sn = match &query.sn {
        Some(s) => s.clone(),
        None => return HttpResponse::BadRequest().body("ERR: Missing SN"),
    };

    let peer_ip = peer_ip(&req);
    log::info!("🔗 [BIOMETRIC] Handshake from device SN={} IP={}", sn, peer_ip);

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().body("ERR: DB"),
    };

    if !crate::biometric_device_logic::is_device_registered(&conn, &sn) {
        log::warn!("⛔ [BIOMETRIC] Handshake ignored — unregistered SN={}", sn);
        return HttpResponse::Ok().content_type("text/plain").body("OK");
    }

    record_device_touch(&conn, &events, &sn, &peer_ip, "device_online");

    // Return iClock-compatible response telling the device we accept it
    let response = format!(
        "GET OPTION FROM: {}\r\nStamp=9999\r\nOpStamp=9999\r\nPhotoStamp=9999\r\nErrorDelay=60\r\nDelay=10\r\nTransTimes=00:00;14:05\r\nTransInterval=1\r\nTransFlag=TransData AttLog\tOpLog\r\nRealtime=1\r\nEncrypt=0\r\n",
        sn
    );

    HttpResponse::Ok()
        .content_type("text/plain")
        .body(response)
}

/// POST /iclock/cdata — Receive attendance logs (ATTLOG) and operation logs (OPERLOG)
pub async fn iclock_receive(
    pool: web::Data<DbPool>,
    events: web::Data<BiometricEvents>,
    query: web::Query<IClockQuery>,
    req: HttpRequest,
    body: String,
) -> HttpResponse {
    let sn = match &query.sn {
        Some(s) => s.clone(),
        None => return HttpResponse::BadRequest().body("ERR: Missing SN"),
    };

    let table = query.table.as_deref().unwrap_or("ATTLOG");
    let ip = peer_ip(&req);

    log::info!("📥 [BIOMETRIC] Received data from SN={} table={} body_len={}", sn, table, body.len());

    if table == "ATTLOG" || table == "attlog" {
        let conn = match pool.get() {
            Ok(c) => c,
            Err(_) => return HttpResponse::InternalServerError().body("ERR: DB"),
        };

        if !crate::biometric_device_logic::is_device_registered(&conn, &sn) {
            log::warn!("⛔ [BIOMETRIC] Ignoring ATTLOG from unregistered SN={}", sn);
            return HttpResponse::Ok().body("OK");
        }

        if !device_ip_allowed(&conn, &sn, &ip) {
            log::warn!(
                "⛔ [BIOMETRIC] ATTLOG rejected — IP {} does not match registered device SN={}",
                ip,
                sn
            );
            return HttpResponse::Ok().body("OK");
        }

        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut processed = 0;

        // Format: PIN\tTimestamp\tStatus\tVerify\tWorkCode\tReserved1\tReserved2
        for punch in parse_attlog_lines(&body) {
            log::info!(
                "  📋 Punch: PIN={} Time={} Status={} Verify={}",
                punch.pin,
                punch.timestamp,
                punch.status,
                punch.verify
            );

            if store_incoming_punch(
                &conn,
                &sn,
                &punch.pin,
                &punch.timestamp,
                punch.status,
                punch.verify,
                &now,
            ) {
                processed += 1;
            }
        }

        // Update device heartbeat
        let _ = conn.execute(
            "UPDATE biometric_devices SET last_heartbeat=?1, updated_at=?1 WHERE serial_number=?2",
            crate::params![&now, &sn],
        );

        log::info!("✅ [BIOMETRIC] Processed {} punches from SN={}", processed, sn);
        if processed > 0 {
            let org_id: Option<i64> = conn
                .query_row(
                    "SELECT organization_id FROM biometric_devices WHERE serial_number = ?1",
                    [&sn],
                    |row| row.get_idx::<i64>(0),
                )
                .ok();
            events.emit(
                "punches_received",
                serde_json::json!({
                    "serial_number": sn,
                    "count": processed,
                    "organization_id": org_id,
                }),
            );
        }
    } else {
        log::info!("ℹ️  [BIOMETRIC] Ignoring table={} from SN={}", table, sn);
    }

    HttpResponse::Ok().content_type("text/plain").body("OK")
}

/// GET /iclock/getrequest — Device polls for pending commands
pub async fn iclock_getrequest(
    pool: web::Data<DbPool>,
    events: web::Data<BiometricEvents>,
    query: web::Query<IClockQuery>,
    req: HttpRequest,
) -> HttpResponse {
    let sn = match &query.sn {
        Some(s) => s.clone(),
        None => return HttpResponse::BadRequest().body("ERR: Missing SN"),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().body("ERR: DB"),
    };

    if !crate::biometric_device_logic::is_device_registered(&conn, &sn) {
        return HttpResponse::Ok().content_type("text/plain").body("OK");
    }

    let peer_ip = peer_ip(&req);
    record_device_touch(&conn, &events, &sn, &peer_ip, "device_heartbeat");

    if let Some(body) = take_pending_command(&conn, &sn) {
        return HttpResponse::Ok().content_type("text/plain").body(body);
    }

    HttpResponse::Ok().content_type("text/plain").body("OK")
}

/// POST /iclock/devicecmd — Device reports command execution result
pub async fn iclock_devicecmd(pool: web::Data<DbPool>, query: web::Query<IClockQuery>, body: String) -> HttpResponse {
    let sn = query.sn.as_deref().unwrap_or("unknown");
    log::info!("📨 [BIOMETRIC] Command result from SN={}: {}", sn, body.trim());

    // Parse command ID from result and update status
    // Format: "ID=xxx&Return=0" or similar
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::Ok().body("OK"),
    };

    // Try to extract command ID
    for part in body.split('&') {
        if part.starts_with("ID=") {
            if let Ok(cmd_id) = part[3..].parse::<i64>() {
                let _ = conn.execute(
                    "UPDATE biometric_commands SET status='executed', result=?1 WHERE id=?2",
                    crate::params![&body, cmd_id],
                );
            }
        }
    }

    HttpResponse::Ok().content_type("text/plain").body("OK")
}

// ═══════════════════════════════════════════════════════════════════
//  Punch → Attendance Resolution Logic
// ═══════════════════════════════════════════════════════════════════

/// BIO-PARK / iClock devices often send unreliable in/out flags (status=0 on every
/// scan, or inout=1 on every face scan after the first checkout). Infer from open
/// attendance first, then alternate from the last stored punch.
pub fn resolve_effective_punch_type(
    conn: &crate::db::Connection,
    user_id: Option<i64>,
    device_serial: &str,
    device_pin: &str,
    device_status: i64,
    timestamp: &str,
    verify_method: i64,
) -> i64 {
    let date = if timestamp.len() >= 10 {
        &timestamp[..10]
    } else {
        return next_punch_type(conn, device_serial, device_pin);
    };

    if let Some(uid) = user_id {
        use crate::attendance_logic::find_open_attendance_session;
        if find_open_attendance_session(conn, uid, date).is_some() {
            return 1;
        }
        // Face scanners often send status=1 on every scan after the first checkout.
        if device_status == 1 && verify_method != 0 {
            return 0;
        }
        // Fingerprint/card checkout with no open session — leave as orphan (unprocessed).
        return device_status;
    }

    // Unmapped: alternate from last punch; ignore sticky device checkout when last was out.
    let inferred = next_punch_type(conn, device_serial, device_pin);
    if device_status == 1 && inferred == 0 {
        log::info!(
            "  🔄 Device sent checkout (status=1) for unmapped PIN={} but last punch was out — treating as check-in",
            device_pin
        );
    }
    inferred
}

/// Toggle check-in/out from the last stored punch when device status is unreliable.
pub fn next_punch_type(conn: &crate::db::Connection, device_serial: &str, device_pin: &str) -> i64 {
    let last: Option<i64> = conn
        .query_row(
            "SELECT punch_type FROM biometric_punches
             WHERE device_serial=?1 AND device_pin=?2
             ORDER BY punch_time DESC, id DESC LIMIT 1",
            crate::params![device_serial, device_pin],
            |row| row.get_idx::<i64>(0),
        )
        .ok();
    match last {
        Some(0) => 1,
        _ => 0,
    }
}

/// Resolve a stored punch into attendance; returns true when the punch is consumed.
pub fn process_punch_to_attendance(
    conn: &crate::db::Connection,
    punch_id: i64,
    user_id: i64,
    timestamp: &str,
    status: i64,
) {
    if resolve_punch_to_attendance(conn, user_id, timestamp, status) {
        let _ = conn.execute(
            "UPDATE biometric_punches SET is_processed=1 WHERE id=?1",
            [punch_id],
        );
    }
}

/// Sync unprocessed biometric punches for an org within an inclusive date range.
pub fn sync_org_biometric_punches_between(
    conn: &crate::db::Connection,
    org_id: i64,
    start_date: &str,
    end_date: &str,
) -> i64 {
    let stmt = match conn.prepare(
        "SELECT bp.id, bp.punch_time, bp.punch_type, bp.user_id
         FROM biometric_punches bp
         INNER JOIN biometric_devices bd ON bd.serial_number = bp.device_serial
         WHERE bd.organization_id = ?1
           AND bp.is_processed = 0
           AND bp.user_id IS NOT NULL
           AND substr(bp.punch_time, 1, 10) >= ?2
           AND substr(bp.punch_time, 1, 10) <= ?3
         ORDER BY bp.punch_time ASC, bp.id ASC",
    ) {
        Ok(s) => s,
        Err(_) => return 0,
    };

    let punches: Vec<(i64, String, i64, i64)> = stmt.query_map(
        crate::params![org_id, start_date, end_date],
        |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<i64>(2)?,
                row.get_idx::<i64>(3)?,
            ))
        },
    );

    let mut count = 0i64;
    for (punch_id, timestamp, punch_type, user_id) in punches {
        process_punch_to_attendance(conn, punch_id, user_id, &timestamp, punch_type);
        count += 1;
    }
    count
}

fn resolve_punch_to_attendance(conn: &crate::db::Connection, user_id: i64, timestamp: &str, status: i64) -> bool {
    use crate::attendance_logic::{close_open_session_before_clock_in, find_open_attendance_session};
    use crate::shift_logic::{
        calc_duration_minutes, early_for_shift, late_for_shift, resolve_shift_for_user,
    };

    // Extract date from timestamp (e.g., "2026-06-03 09:15:22" → "2026-06-03")
    let date = if timestamp.len() >= 10 { &timestamp[..10] } else { return false; };
    let time = if timestamp.len() >= 19 { &timestamp[11..19] } else { return false; };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let shift = resolve_shift_for_user(conn, user_id, date);

    // Active session: same-day first, then any open session (overnight / night shift)
    let active_session = find_open_attendance_session(conn, user_id, date);

    let insert_clock_in = |is_late: bool| {
        let _ = conn.execute(
            "INSERT INTO attendance (user_id, date, clock_in, status, is_late, source, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'present', ?4, 'biometric', ?5, ?5)",
            crate::params![user_id, date, time, if is_late { 1 } else { 0 }, &now],
        );
    };

    let clock_out_session = |att_id: i64, session_date: &str| {
        let session_shift = resolve_shift_for_user(conn, user_id, session_date);
        let clock_in: String = conn
            .query_row(
                "SELECT clock_in FROM attendance WHERE id=?1",
                [att_id],
                |row| row.get_idx::<String>(0),
            )
            .unwrap_or_default();
        let duration = calc_duration_minutes(&clock_in, time);
        let early = early_for_shift(&session_shift, time);
        let _ = conn.execute(
            "UPDATE attendance SET clock_out=?1, duration_minutes=?2, is_early_exit=?3, updated_at=?4 WHERE id=?5",
            crate::params![time, duration, if early { 1 } else { 0 }, &now, att_id],
        );
    };

    match (status, active_session) {
        // Check-in while session already open on same day — ignore duplicate punch
        (0, Some((att_id, session_date, _))) if session_date == date => {
            log::warn!(
                "  ⚠️ Duplicate check-in ignored for user_id={} at {} (open session id={})",
                user_id,
                timestamp,
                att_id
            );
            true
        }
        // Check-in with open session from prior day — close it, then start new session
        (0, Some((att_id, _, _))) => {
            close_open_session_before_clock_in(conn, user_id, date, time, &now, &shift);
            let is_late = late_for_shift(&shift, time);
            insert_clock_in(is_late);
            log::info!(
                "  ✅ Clock-IN (new session) for user_id={} at {} closed={} shift={:?} late={}",
                user_id,
                timestamp,
                att_id,
                shift.template_name,
                is_late
            );
            true
        }
        (0, None) => {
            let is_late = late_for_shift(&shift, time);
            insert_clock_in(is_late);
            log::info!("  ✅ Clock-IN created for user_id={} at {}", user_id, timestamp);
            true
        }
        // Explicit check-out with an open session (including overnight from prior day)
        (1, Some((att_id, session_date, _))) => {
            clock_out_session(att_id, &session_date);
            log::info!(
                "  ✅ Clock-OUT for user_id={} at {} (session date={})",
                user_id,
                timestamp,
                session_date
            );
            true
        }
        (1, None) => {
            log::warn!(
                "  ⚠️ Orphan check-out ignored for user_id={} at {} — no open session",
                user_id,
                timestamp
            );
            true
        }
        // Non check-in punch while session is open → clock out (device sometimes sends status 2+)
        (_, Some((att_id, session_date, _))) => {
            clock_out_session(att_id, &session_date);
            log::info!(
                "  ✅ Clock-OUT (status={}) for user_id={} at {} (session date={})",
                status,
                user_id,
                timestamp,
                session_date
            );
            true
        }
        (_, None) => {
            log::warn!(
                "  ⚠️ Unhandled punch status={} for user_id={} at {} — no open session",
                status,
                user_id,
                timestamp
            );
            false
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  Admin API Endpoints (Authenticated)
// ═══════════════════════════════════════════════════════════════════

/// GET /api/admin/biometric/devices — List all registered devices
pub async fn devices_list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    let stmt = conn.prepare(
        "SELECT * FROM biometric_devices WHERE organization_id = ?1 ORDER BY created_at DESC"
    ).unwrap();
    let items: Vec<BiometricDevice> = stmt.query_map([org_id], BiometricDevice::from_row);

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/admin/biometric/devices — Register a device manually
pub async fn devices_store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<serde_json::Value>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    let sn = body.get("serial_number").and_then(|v| v.as_str()).unwrap_or("");
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("BIO-PARK D01");
    let location = body.get("location").and_then(|v| v.as_str()).unwrap_or("");
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if sn.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("serial_number is required"));
    }

    if let Ok(existing_org) = conn.query_row(
        "SELECT organization_id FROM biometric_devices WHERE serial_number = ?1",
        [sn],
        |r| r.get_idx::<i64>(0),
    ) {
        if existing_org != org_id {
            return HttpResponse::Conflict().json(ApiError::new(
                "Device serial number is already registered to another organization",
            ));
        }
    }

    match conn.execute(
        "INSERT INTO biometric_devices (serial_number, name, location, organization_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(serial_number) DO UPDATE SET
            name = excluded.name,
            location = excluded.location,
            updated_at = excluded.updated_at",
        crate::params![sn, name, location, org_id, &now],
    ) {
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Device registered"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {}", e))),
    }
}

/// DELETE /api/admin/biometric/devices/{id}
pub async fn devices_destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let id = path.into_inner();
    match conn.execute(
        "DELETE FROM biometric_devices WHERE id = ?1 AND organization_id = ?2",
        crate::params![id, org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Device not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Device deleted"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {}", e))),
    }
}

/// GET /api/admin/biometric/punches — List raw punch logs
pub async fn punches_list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    let view_org = crate::handlers::attendance::can_view_org_attendance(&conn, &claims, org_id);
    let user_filter = if view_org {
        String::new()
    } else {
        " AND bp.user_id = ?2".to_string()
    };
    let sql = format!(
        "SELECT bp.*, u.name as user_name FROM biometric_punches bp
         LEFT JOIN users u ON bp.user_id = u.id AND u.organization_id = ?1
         WHERE bp.device_serial IN (
            SELECT serial_number FROM biometric_devices WHERE organization_id = ?1
         ){user_filter}
         ORDER BY datetime(bp.punch_time) DESC, bp.id DESC LIMIT 500"
    );

    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{}", e))),
    };

    let items: Vec<serde_json::Value> = if view_org {
        stmt.query_map([org_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<i64>("id")?,
                "device_serial": row.get::<String>("device_serial")?,
                "device_pin": row.get::<String>("device_pin")?,
                "punch_time": row.get::<String>("punch_time")?,
                "punch_type": row.get::<i64>("punch_type")?,
                "verify_method": row.get::<i64>("verify_method")?,
                "user_id": row.get::<Option<i64>>("user_id")?,
                "user_name": row.get::<Option<String>>("user_name").unwrap_or(None),
                "is_processed": row.get::<i64>("is_processed")?,
                "created_at": row.get::<Option<String>>("created_at")?,
            }))
        })
    } else {
        stmt.query_map(crate::params![org_id, claims.sub], |row| {
            Ok(serde_json::json!({
                "id": row.get::<i64>("id")?,
                "device_serial": row.get::<String>("device_serial")?,
                "device_pin": row.get::<String>("device_pin")?,
                "punch_time": row.get::<String>("punch_time")?,
                "punch_type": row.get::<i64>("punch_type")?,
                "verify_method": row.get::<i64>("verify_method")?,
                "user_id": row.get::<Option<i64>>("user_id")?,
                "user_name": row.get::<Option<String>>("user_name").unwrap_or(None),
                "is_processed": row.get::<i64>("is_processed")?,
                "created_at": row.get::<Option<String>>("created_at")?,
            }))
        })
    };

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// GET /api/admin/biometric/mapping — List user-device mappings
pub async fn mapping_list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    let stmt = conn.prepare(
        "SELECT bm.*, u.name as user_name FROM biometric_user_map bm
         INNER JOIN users u ON bm.user_id = u.id AND u.organization_id = ?1
         INNER JOIN biometric_devices bd ON bd.serial_number = bm.device_serial AND bd.organization_id = ?1
         ORDER BY bm.device_serial, bm.device_pin"
    ).unwrap();

    let items: Vec<serde_json::Value> = stmt.query_map([org_id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<i64>("id")?,
            "device_serial": row.get::<String>("device_serial")?,
            "device_pin": row.get::<String>("device_pin")?,
            "user_id": row.get::<i64>("user_id")?,
            "user_name": row.get::<Option<String>>("user_name").unwrap_or(None),
            "created_at": row.get::<Option<String>>("created_at")?,
        }))
    });

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/admin/biometric/mapping — Create a user-device PIN mapping
pub async fn mapping_store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<UserMapRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    let user_ok = conn
        .query_row(
            "SELECT 1 FROM users WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
            crate::params![body.user_id, org_id],
            |_| Ok(()),
        )
        .is_ok();
    if !user_ok {
        return HttpResponse::BadRequest().json(ApiError::new("User not found in your organization"));
    }

    let device_ok = conn
        .query_row(
            "SELECT 1 FROM biometric_devices WHERE serial_number = ?1 AND organization_id = ?2",
            crate::params![&body.device_serial, org_id],
            |_| Ok(()),
        )
        .is_ok();
    if !device_ok {
        return HttpResponse::BadRequest().json(ApiError::new("Device not registered to your organization"));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    match conn.execute(
        "INSERT INTO biometric_user_map (device_serial, device_pin, user_id, created_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(device_serial, device_pin) DO UPDATE SET user_id=?3",
        crate::params![&body.device_serial, &body.device_pin, body.user_id, &now],
    ) {
        Ok(_) => {
            // Retroactively resolve any unprocessed punches for this PIN
            let punch_count = retroactive_resolve(&conn, &body.device_serial, &body.device_pin, body.user_id);
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
                "message": "Mapping saved",
                "retroactive_punches": punch_count,
            })))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {}", e))),
    }
}

/// DELETE /api/admin/biometric/mapping/{id}
pub async fn mapping_destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let id = path.into_inner();
    match conn.execute(
        "DELETE FROM biometric_user_map
         WHERE id = ?1
           AND user_id IN (SELECT id FROM users WHERE organization_id = ?2)",
        crate::params![id, org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Mapping not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Mapping deleted"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {}", e))),
    }
}

/// GET /api/admin/biometric/stats — Dashboard statistics
pub async fn biometric_stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    let view_org = crate::handlers::attendance::can_view_org_attendance(&conn, &claims, org_id);
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    if !view_org {
        let today_punches: i64 = conn.query_row(
            "SELECT COUNT(*) FROM biometric_punches bp
             WHERE bp.user_id = ?1 AND bp.punch_time LIKE ?2 || '%'
               AND bp.device_serial IN (
                   SELECT serial_number FROM biometric_devices WHERE organization_id = ?3
               )",
            crate::params![claims.sub, &today, org_id],
            |r| r.get_idx::<i64>(0),
        ).unwrap_or(0);

        return HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "scope": "self",
            "today_punches": today_punches,
        })));
    }

    let total_devices: i64 = conn.query_row(
        "SELECT COUNT(*) FROM biometric_devices WHERE organization_id = ?1",
        [org_id],
        |r| r.get_idx::<i64>(0),
    ).unwrap_or(0);
    let active_devices: i64 = conn.query_row(
        "SELECT COUNT(*) FROM biometric_devices
         WHERE organization_id = ?1
           AND last_heartbeat IS NOT NULL
           AND last_heartbeat >= datetime('now', '-10 minutes')",
        [org_id],
        |r| r.get_idx::<i64>(0),
    ).unwrap_or(0);
    let today_punches: i64 = conn.query_row(
        "SELECT COUNT(*) FROM biometric_punches bp
         WHERE bp.punch_time LIKE ?1 || '%'
           AND bp.device_serial IN (
               SELECT serial_number FROM biometric_devices WHERE organization_id = ?2
           )",
        crate::params![&today, org_id],
        |r| r.get_idx::<i64>(0),
    ).unwrap_or(0);
    let total_mappings: i64 = conn.query_row(
        "SELECT COUNT(*) FROM biometric_user_map bm
         INNER JOIN users u ON bm.user_id = u.id AND u.organization_id = ?1",
        [org_id],
        |r| r.get_idx::<i64>(0),
    ).unwrap_or(0);
    let unmapped_punches: i64 = conn.query_row(
        "SELECT COUNT(*) FROM biometric_punches bp
         WHERE bp.user_id IS NULL
           AND bp.device_serial IN (
               SELECT serial_number FROM biometric_devices WHERE organization_id = ?1
           )",
        [org_id],
        |r| r.get_idx::<i64>(0),
    ).unwrap_or(0);

    let last_heartbeat: Option<String> = conn.query_row(
        "SELECT last_heartbeat FROM biometric_devices
         WHERE organization_id = ?1
         ORDER BY last_heartbeat DESC LIMIT 1",
        [org_id],
        |r| r.get_idx::<Option<String>>(0),
    ).ok().flatten();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "scope": "org",
        "total_devices": total_devices,
        "active_devices": active_devices,
        "today_punches": today_punches,
        "total_mappings": total_mappings,
        "unmapped_punches": unmapped_punches,
        "last_heartbeat": last_heartbeat,
    })))
}

fn ws_token_from_query(req: &HttpRequest, jwt_secret: &str) -> Result<JwtClaims, Error> {
    let token = req
        .uri()
        .query()
        .and_then(|q| {
            url_query_param(q, "token")
        })
        .ok_or_else(|| ErrorUnauthorized("Missing token query parameter"))?;

    crate::middleware::auth::decode_tenant_token(token, jwt_secret)
        .map_err(|e| ErrorUnauthorized(e.to_string()))
}

fn url_query_param<'a>(query: &'a str, key: &str) -> Option<&'a str> {
    query.split('&').find_map(|pair| {
        let mut parts = pair.splitn(2, '=');
        if parts.next()? == key {
            parts.next()
        } else {
            None
        }
    })
}

/// GET /api/admin/biometric/ws?token=JWT — live updates for admin UI (reconnects like a persistent channel).
pub async fn biometric_live_ws(
    req: HttpRequest,
    stream: web::Payload,
    pool: web::Data<DbPool>,
    events: web::Data<BiometricEvents>,
    jwt: web::Data<Arc<String>>,
) -> Result<HttpResponse, Error> {
    let claims = ws_token_from_query(&req, jwt.as_str())?;
    let conn = pool
        .get()
        .map_err(|_| ErrorUnauthorized("Database unavailable"))?;
    if let Err(msg) = crate::middleware::rbac::ensure_ws_access(&conn, &claims, req.path()) {
        return Err(ErrorUnauthorized(msg));
    }
    let org_id = claims.organization_id;

    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, stream)?;

    let mut rx = events.subscribe();

    actix_web::rt::spawn(async move {
        let welcome = serde_json::json!({
            "type": "connected",
            "message": "Biometric live stream active",
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
                        Some(Ok(Message::Ping(bytes))) => {
                            if session.pong(&bytes).await.is_err() {
                                break;
                            }
                        }
                        Some(Ok(Message::Close(_))) | None => break,
                        Some(Err(_)) => break,
                        _ => {}
                    }
                }
                evt = rx.recv() => {
                    match evt {
                        Ok(payload) => {
                            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&payload) {
                                let event_org = value.get("organization_id").and_then(|v| v.as_i64());
                                if event_org != Some(org_id) {
                                    continue;
                                }
                            }
                            if session.text(payload).await.is_err() {
                                break;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(_) => break,
                    }
                }
            }
        }
        let _ = session.close(None).await;
    });

    Ok(response)
}

// ═══════════════════════════════════════════════════════════════════
//  Helper: Retroactive resolution for newly-mapped PINs
// ═══════════════════════════════════════════════════════════════════

fn retroactive_resolve(conn: &crate::db::Connection, device_serial: &str, device_pin: &str, user_id: i64) -> i64 {
    // Update all unprocessed punches for this PIN with the user_id
    let _ = conn.execute(
        "UPDATE biometric_punches SET user_id=?1 WHERE device_serial=?2 AND device_pin=?3 AND user_id IS NULL",
        crate::params![user_id, device_serial, device_pin],
    );

    // Get all unprocessed punches for this user, ordered by time
    let stmt = match conn.prepare(
        "SELECT id, punch_time, punch_type FROM biometric_punches
         WHERE device_serial=?1 AND device_pin=?2 AND is_processed=0
         ORDER BY punch_time ASC"
    ) {
        Ok(s) => s,
        Err(_) => return 0,
    };

    let punches: Vec<(i64, String, i64)> = stmt.query_map(
        crate::params![device_serial, device_pin],
        |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<String>(1)?, row.get_idx::<i64>(2)?)),
    );

    let mut count: i64 = 0;
    for (punch_id, timestamp, status) in &punches {
        process_punch_to_attendance(conn, *punch_id, user_id, timestamp, *status);
        count += 1;
    }

    count
}

// ═══════════════════════════════════════════════════════════════════
//  M-CARD / BIO-PARK ADMS Protocol (/pub/chat)
//  The device sends GET /pub/chat for handshake and POST /pub/chat
//  to push attendance data. Query params carry SN, options, etc.
// ═══════════════════════════════════════════════════════════════════

/// Query params the M-CARD ADMS device sends on /pub/chat
#[derive(Debug, serde::Deserialize)]
pub struct AdmsQuery {
    #[serde(rename = "SN", alias = "sn")]
    pub sn: Option<String>,
    #[serde(rename = "TABLE", alias = "table")]
    pub table: Option<String>,
}

/// GET /pub/chat — WebSocket endpoint for BIO-PARK device communication.
/// The device requests a WebSocket upgrade here. All attendance data and
/// heartbeats flow through this persistent WS connection.
pub async fn adms_chat_ws(
    pool: web::Data<DbPool>,
    events: web::Data<BiometricEvents>,
    req: HttpRequest,
    stream: web::Payload,
) -> Result<HttpResponse, Error> {
    let peer_ip = req.peer_addr().map(|a| a.ip().to_string()).unwrap_or_default();
    log::info!("🔗 [ADMS-WS] WebSocket upgrade from {}", peer_ip);

    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, stream)?;

    let pool = pool.clone();
    let events = events.clone();

    actix_web::rt::spawn(async move {
        log::info!("✅ [ADMS-WS] Connection established with {}", peer_ip);

        while let Some(msg) = msg_stream.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    let text_str = text.to_string();
                    log::info!("📨 [ADMS-WS] Text from {}: {}", peer_ip, text_str);

                    // Parse the device message — may produce multiple responses
                    let responses = handle_adms_ws_message(&pool, &events, &text_str, &peer_ip);
                    for resp in responses {
                        log::info!("📤 [ADMS-WS] Sending to {}: {}", peer_ip, resp);
                        if session.text(resp).await.is_err() {
                            break;
                        }
                    }
                }
                Ok(Message::Binary(bin)) => {
                    log::info!("📨 [ADMS-WS] Binary ({} bytes) from {}", bin.len(), peer_ip);
                    if session.text("OK").await.is_err() {
                        break;
                    }
                }
                Ok(Message::Ping(bytes)) => {
                    if session.pong(&bytes).await.is_err() {
                        break;
                    }
                }
                Ok(Message::Pong(_)) => {}
                Ok(Message::Close(_)) => {
                    log::info!("🔌 [ADMS-WS] Device {} closed connection", peer_ip);
                    break;
                }
                Ok(Message::Continuation(_)) => {}
                Ok(Message::Nop) => {}
                Err(e) => {
                    log::error!("❌ [ADMS-WS] Error from {}: {}", peer_ip, e);
                    break;
                }
            }
        }

        log::info!("🔌 [ADMS-WS] Session ended for {}", peer_ip);
        let _ = session.close(None).await;
    });

    Ok(response)
}

/// Parse a WebSocket text message from the BIO-PARK device and return JSON responses.
/// The device sends JSON messages with a "cmd" field.
/// Returns multiple messages (e.g., reg ack + getlog request).
fn handle_adms_ws_message(
    pool: &web::Data<DbPool>,
    events: &web::Data<BiometricEvents>,
    text: &str,
    ip: &str,
) -> Vec<String> {
    // Try to parse as JSON
    let msg: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => {
            log::warn!("[ADMS-WS] Non-JSON message from {}: {}", ip, text);
            return vec![serde_json::json!({"ret":"OK"}).to_string()];
        }
    };

    let cmd = msg.get("cmd").and_then(|v| v.as_str()).unwrap_or("");
    let sn = msg.get("sn").and_then(|v| v.as_str()).unwrap_or("unknown");

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return vec![serde_json::json!({"ret":"ERR","reason":"DB"}).to_string()],
    };

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    match cmd {
        // ── Device Registration ──────────────────────────────────
        "reg" => {
            log::info!("✅ [ADMS-WS] Device registered: SN={} IP={}", sn, ip);

            let devinfo = msg.get("devinfo");
            let model = devinfo.and_then(|d| d.get("modelname")).and_then(|v| v.as_str()).unwrap_or("BIO-PARK");
            let firmware = devinfo.and_then(|d| d.get("firmware")).and_then(|v| v.as_str()).unwrap_or("");
            let mac = devinfo.and_then(|d| d.get("mac")).and_then(|v| v.as_str()).unwrap_or("");
            let new_logs = devinfo.and_then(|d| d.get("usednewlog")).and_then(|v| v.as_i64()).unwrap_or(0);

            let name = format!("{} ({})", model, firmware);

            if !crate::biometric_device_logic::is_device_registered(&conn, &sn) {
                log::warn!(
                    "⛔ [ADMS-WS] Device SN={} not pre-registered — register in Admin → Biometric first",
                    sn
                );
                return vec![serde_json::json!({
                    "ret": "reg",
                    "result": false,
                    "reason": "not_registered",
                })
                .to_string()];
            }

            if let Some(org_id) = crate::biometric_device_logic::touch_registered_device(
                &conn,
                sn,
                Some(&name),
                Some(ip),
                &now,
            ) {
                events.emit(
                    "device_online",
                    serde_json::json!({
                        "organization_id": org_id,
                        "serial_number": sn,
                        "ip_address": ip,
                        "model": model,
                        "firmware": firmware,
                        "mac": mac,
                        "new_logs": new_logs,
                        "last_heartbeat": now,
                    }),
                );
            }

            // Build response: ACK the registration with options.
            // cloudtime must match device timezone (UTC+5:30 IST)
            let ist_offset = chrono::FixedOffset::east_opt(5 * 3600 + 30 * 60)
                .unwrap_or_else(|| chrono::FixedOffset::east_opt(0).unwrap());
            let cloudtime = chrono::Utc::now().with_timezone(&ist_offset)
                .format("%Y-%m-%d %H:%M:%S").to_string();

            // result:true is CRITICAL — device won't proceed without it!
            // nosenduser=0, nosendlog=0: tell device to push both users and logs
            // realtime=1: push attendance events in real-time
            let responses = vec![
                serde_json::json!({
                    "ret": "reg",
                    "result": true,
                    "cloudtime": cloudtime,
                    "nosenduser": 0,
                    "nosendlog": 0,
                    "transinterval": 1,
                    "transtimes": "00:00;14:05",
                    "realtime": 1,
                    "encrypt": 0
                }).to_string(),
                // Ask device to upload pending attendance logs immediately after reg
                serde_json::json!({"cmd": "getalllog", "stn": true}).to_string(),
            ];

            responses
        }

        // ── Attendance Log Push ──────────────────────────────────
        "sendlog" => {
            if !crate::biometric_device_logic::is_device_registered(&conn, &sn) {
                log::warn!(
                    "⛔ [ADMS-WS] Ignoring sendlog from unregistered SN={}",
                    sn
                );
                return vec![serde_json::json!({"ret": "sendlog", "result": false}).to_string()];
            }

            // record can be a single object OR an array of objects
            let records: Vec<&serde_json::Value> = match msg.get("record") {
                Some(serde_json::Value::Array(arr)) => arr.iter().collect(),
                Some(obj @ serde_json::Value::Object(_)) => vec![obj],
                _ => vec![],
            };

            let total = records.len();
            let mut stored = 0;

            let mut ws_punches: Vec<(String, String, i64, i64)> = Vec::new();
            for rec in &records {
                let pin = rec
                    .get("enrollid")
                    .map(|v| match v {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Number(n) => n.to_string(),
                        _ => String::new(),
                    })
                    .or_else(|| rec.get("pin").and_then(|v| v.as_str()).map(String::from))
                    .unwrap_or_default();
                let timestamp = rec
                    .get("time")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let verify: i64 = rec
                    .get("type")
                    .and_then(|v| v.as_i64())
                    .or_else(|| rec.get("verify").and_then(|v| v.as_i64()))
                    .unwrap_or(0);
                let inout: i64 = rec.get("inout").and_then(|v| v.as_i64()).unwrap_or(0);

                if pin.is_empty() || timestamp.is_empty() {
                    continue;
                }
                ws_punches.push((pin, timestamp, inout, verify));
            }
            ws_punches.sort_by(|a, b| a.1.cmp(&b.1));

            for (pin, timestamp, inout, verify) in ws_punches {
                log::info!(
                    "📋 [ADMS-WS] Punch: SN={} PIN={} Time={} InOut={}",
                    sn,
                    pin,
                    timestamp,
                    inout
                );

                if store_incoming_punch(&conn, sn, &pin, &timestamp, inout, verify, &now) {
                    stored += 1;
                }
            }

            if stored > 0 {
                log::info!("✅ [ADMS-WS] Stored {}/{} punches from SN={}", stored, total, sn);
                events.emit(
                    "punches_received",
                    serde_json::json!({
                        "serial_number": sn,
                        "count": stored,
                    }),
                );
            }

            // ACK — count must match what the device sent
            vec![serde_json::json!({"ret":"sendlog","result":true,"count":total,"logindex":0}).to_string()]
        }

        // ── User data from device ────────────────────────────────
        "senduser" => {
            log::info!("👤 [ADMS-WS] User data from SN={}: {}", sn, text);
            vec![serde_json::json!({"ret":"senduser","result":1,"count":1}).to_string()]
        }

        // ── Heartbeat / keep-alive ───────────────────────────────
        "heartbeat" | "ping" => {
            record_device_touch(&conn, events, sn, ip, "device_heartbeat");
            vec![serde_json::json!({"ret":"heartbeat","cloudtime": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()}).to_string()]
        }

        // ── Unknown command ──────────────────────────────────────
        _ => {
            log::info!("❓ [ADMS-WS] Unknown cmd='{}' from SN={}: {}", cmd, sn, text);
            vec![serde_json::json!({"ret": cmd, "result": 1}).to_string()]
        }
    }
}



/// POST /pub/chat — Device pushes attendance logs.
/// Body contains tab-separated ATTLOG records, one per line.
pub async fn adms_chat_post(
    pool: web::Data<DbPool>,
    events: web::Data<BiometricEvents>,
    query: web::Query<AdmsQuery>,
    req: HttpRequest,
    body: String,
) -> HttpResponse {
    let sn = query.sn.clone().unwrap_or_else(|| "unknown".into());
    let table = query.table.as_deref().unwrap_or("ATTLOG");
    let peer_ip = peer_ip(&req);

    log::info!(
        "📥 [ADMS] POST /pub/chat — SN={} table={} body_len={} IP={}",
        sn, table, body.len(), peer_ip
    );
    log::info!("📥 [ADMS] Body:\n{}", body);

    if table.eq_ignore_ascii_case("ATTLOG") {
        let conn = match pool.get() {
            Ok(c) => c,
            Err(_) => return HttpResponse::InternalServerError().body("ERR: DB"),
        };

        if !crate::biometric_device_logic::is_device_registered(&conn, &sn) {
            log::warn!("⛔ [ADMS] Ignoring ATTLOG from unregistered SN={}", sn);
            return HttpResponse::Ok().content_type("text/plain").body("OK");
        }

        if !device_ip_allowed(&conn, &sn, &peer_ip) {
            log::warn!(
                "⛔ [ADMS] ATTLOG rejected — IP {} does not match registered device SN={}",
                peer_ip,
                sn
            );
            return HttpResponse::Ok().content_type("text/plain").body("OK");
        }

        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut processed = 0;

        for punch in parse_attlog_lines(&body) {
            log::info!(
                "  📋 [ADMS] Punch: PIN={} Time={} Status={} Verify={}",
                punch.pin,
                punch.timestamp,
                punch.status,
                punch.verify
            );

            if store_incoming_punch(
                &conn,
                &sn,
                &punch.pin,
                &punch.timestamp,
                punch.status,
                punch.verify,
                &now,
            ) {
                processed += 1;
            }
        }

        // Update heartbeat
        let _ = conn.execute(
            "UPDATE biometric_devices SET last_heartbeat=?1, updated_at=?1 WHERE serial_number=?2",
            crate::params![&now, &sn],
        );

        log::info!("✅ [ADMS] Processed {} punches from SN={}", processed, sn);
        if processed > 0 {
            events.emit(
                "punches_received",
                serde_json::json!({
                    "serial_number": sn,
                    "count": processed,
                }),
            );
        }
    } else {
        log::info!("ℹ️  [ADMS] Ignoring table={} from SN={}", table, sn);
    }

    HttpResponse::Ok().content_type("text/plain").body("OK")
}

/// GET /pub/getrequest — Device polls for pending commands (ADMS variant)
pub async fn adms_getrequest(
    pool: web::Data<DbPool>,
    events: web::Data<BiometricEvents>,
    query: web::Query<AdmsQuery>,
    req: HttpRequest,
) -> HttpResponse {
    // Reuse the iClock getrequest logic
    let sn = query.sn.clone().unwrap_or_else(|| "unknown".into());
    let peer_ip = peer_ip(&req);

    if let Ok(conn) = pool.get() {
        if !crate::biometric_device_logic::is_device_registered(&conn, &sn) {
            return HttpResponse::Ok().content_type("text/plain").body("OK");
        }

        record_device_touch(&conn, &events, &sn, &peer_ip, "device_heartbeat");

        if let Some(body) = take_pending_command(&conn, &sn) {
            return HttpResponse::Ok().content_type("text/plain").body(body);
        }
    }

    HttpResponse::Ok().content_type("text/plain").body("OK")
}

use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool; use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};

pub async fn hr_dashboard(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    let total_employees: i64 = conn.query_row("SELECT COUNT(*) FROM users WHERE is_super_admin=0 AND department_id IS NOT NULL AND deleted_at IS NULL", [], |r| r.get(0)).unwrap_or(0);
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let today_attendance: i64 = conn.query_row("SELECT COUNT(*) FROM attendance WHERE date=?1", [&today], |r| r.get(0)).unwrap_or(0);
    let eligible: i64 = total_employees;
    let att_pct = if eligible > 0 { (today_attendance as f64 / eligible as f64 * 100.0 * 10.0).round() / 10.0 } else { 0.0 };
    let pending_requests: i64 = conn.query_row("SELECT COUNT(*) FROM leave_requests WHERE status='pending'", [], |r| r.get(0)).unwrap_or(0);
    let active_projects: i64 = conn.query_row("SELECT COUNT(*) FROM projects WHERE status='in_progress'", [], |r| r.get(0)).unwrap_or(0);

    // Task stats
    let todo: i64 = conn.query_row("SELECT COUNT(*) FROM tasks WHERE status='todo'", [], |r| r.get(0)).unwrap_or(0);
    let in_progress: i64 = conn.query_row("SELECT COUNT(*) FROM tasks WHERE status='in_progress'", [], |r| r.get(0)).unwrap_or(0);
    let completed: i64 = conn.query_row("SELECT COUNT(*) FROM tasks WHERE status='completed'", [], |r| r.get(0)).unwrap_or(0);

    // Upcoming holidays
    let mut hstmt = conn.prepare("SELECT name, date FROM holidays WHERE date >= ?1 ORDER BY date LIMIT 4").unwrap();
    let holidays: Vec<serde_json::Value> = hstmt.query_map([&today], |row| {
        let name: String = row.get(0)?;
        let date: String = row.get(1)?;
        Ok(serde_json::json!({"name": name, "date": date}))
    }).unwrap().filter_map(|r| r.ok()).collect();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "metrics": { "totalEmployees": total_employees, "attendancePercentage": att_pct, "attendanceCount": today_attendance, "pendingRequests": pending_requests, "activeProjects": active_projects },
        "attendance": { "leaveTypes": {}, "trends": [], "upcomingHolidays": holidays },
        "payroll": { "currentMonth": 0, "previousMonth": 0, "change": 0, "byDepartment": [] },
        "operations": { "taskProgress": { "todo": todo, "in_progress": in_progress, "completed": completed, "on_hold": 0 }, "celebrations": [], "recentWorkflows": [] }
    })))
}

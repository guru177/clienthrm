use actix_web::web;
use crate::handlers;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg
        // Health check
        .route("/api/health", web::get().to(|| async {
            actix_web::HttpResponse::Ok().json(serde_json::json!({"status": "ok", "service": "hrm-backend"}))
        }))

        // ── Auth ──
        .route("/api/auth/login", web::post().to(handlers::auth::login))
        .route("/api/auth/me", web::get().to(handlers::auth::me))
        .route("/api/auth/logout", web::post().to(handlers::auth::logout))

        // ── Dashboard Analytics ──
        .route("/api/admin/dashboard/hr-data", web::get().to(handlers::analytics::hr_dashboard))

        // ── Users ──
        .route("/api/admin/users", web::get().to(handlers::users::index))
        .route("/api/admin/users/stats", web::get().to(handlers::users::stats))
        .route("/api/admin/users/list", web::get().to(handlers::users::list))
        .route("/api/admin/users", web::post().to(handlers::users::store))
        .route("/api/admin/users/{id}", web::get().to(handlers::users::show))
        .route("/api/admin/users/{id}", web::put().to(handlers::users::update))
        .route("/api/admin/users/{id}", web::delete().to(handlers::users::destroy))

        // ── Departments ──
        .route("/api/admin/departments", web::get().to(handlers::departments::index))
        .route("/api/admin/departments/stats", web::get().to(handlers::departments::stats))
        .route("/api/admin/departments/list", web::get().to(handlers::departments::list))
        .route("/api/admin/departments", web::post().to(handlers::departments::store))
        .route("/api/admin/departments/{id}", web::get().to(handlers::departments::show))
        .route("/api/admin/departments/{id}", web::put().to(handlers::departments::update))
        .route("/api/admin/departments/{id}", web::delete().to(handlers::departments::destroy))

        // ── Designations ──
        .route("/api/admin/designations", web::get().to(handlers::designations::index))
        .route("/api/admin/designations/stats", web::get().to(handlers::designations::stats))
        .route("/api/admin/designations/list", web::get().to(handlers::designations::list))
        .route("/api/admin/designations", web::post().to(handlers::designations::store))
        .route("/api/admin/designations/{id}", web::get().to(handlers::designations::show))
        .route("/api/admin/designations/{id}", web::put().to(handlers::designations::update))
        .route("/api/admin/designations/{id}", web::delete().to(handlers::designations::destroy))

        // ── Roles ──
        .route("/api/admin/roles", web::get().to(handlers::roles::index))
        .route("/api/admin/roles/stats", web::get().to(handlers::roles::stats))
        .route("/api/admin/roles/list", web::get().to(handlers::roles::list))
        .route("/api/admin/roles", web::post().to(handlers::roles::store))
        .route("/api/admin/roles/{id}", web::get().to(handlers::roles::show))
        .route("/api/admin/roles/{id}", web::put().to(handlers::roles::update))
        .route("/api/admin/roles/{id}", web::delete().to(handlers::roles::destroy))

        // ── Permissions ──
        .route("/api/admin/permissions", web::get().to(handlers::permissions::index))
        .route("/api/admin/permissions/list", web::get().to(handlers::permissions::list))
        .route("/api/admin/permissions", web::post().to(handlers::permissions::store))
        .route("/api/admin/permissions/{id}", web::get().to(handlers::permissions::show))
        .route("/api/admin/permissions/{id}", web::put().to(handlers::permissions::update))
        .route("/api/admin/permissions/{id}", web::delete().to(handlers::permissions::destroy))

        // ── Attendance ──
        .route("/api/admin/attendance", web::get().to(handlers::attendance::index))
        .route("/api/admin/attendance/list", web::get().to(handlers::attendance::list))
        .route("/api/admin/attendance/users", web::get().to(handlers::attendance::users))
        .route("/api/admin/attendance/today", web::get().to(handlers::attendance::today))
        .route("/api/admin/attendance/stats", web::get().to(handlers::attendance::stats))
        .route("/api/admin/attendance/clock-in", web::post().to(handlers::attendance::clock_in))
        .route("/api/admin/attendance/clock-out", web::post().to(handlers::attendance::clock_out))

        // ── Leave Requests ──
        .route("/api/admin/leave-requests", web::get().to(handlers::leave_requests::index))
        .route("/api/admin/leave-requests/list", web::get().to(handlers::leave_requests::list))
        .route("/api/admin/leave-requests/stats", web::get().to(handlers::leave_requests::stats))
        .route("/api/admin/leave-requests", web::post().to(handlers::leave_requests::store))
        .route("/api/admin/leave-requests/{id}", web::delete().to(handlers::leave_requests::destroy))
        .route("/api/admin/leave-requests/manage", web::get().to(handlers::leave_requests::manage))
        .route("/api/admin/leave-requests/manage/list", web::get().to(handlers::leave_requests::list_all))
        .route("/api/admin/leave-requests/manage/stats", web::get().to(handlers::leave_requests::admin_stats))
        .route("/api/admin/leave-requests/{id}/approve", web::post().to(handlers::leave_requests::approve))
        .route("/api/admin/leave-requests/{id}/reject", web::post().to(handlers::leave_requests::reject))

        // ── Holidays ──
        .route("/api/admin/holidays", web::get().to(handlers::holidays::index))
        .route("/api/admin/holidays/list", web::get().to(handlers::holidays::list))
        .route("/api/admin/holidays", web::post().to(handlers::holidays::store))
        .route("/api/admin/holidays/{id}", web::put().to(handlers::holidays::update))
        .route("/api/admin/holidays/{id}", web::delete().to(handlers::holidays::destroy))

        // ── Projects ──
        .route("/api/admin/projects", web::get().to(handlers::projects::index))
        .route("/api/admin/projects/list", web::get().to(handlers::projects::index))
        .route("/api/admin/projects", web::post().to(handlers::projects::store))
        .route("/api/admin/projects/{id}", web::get().to(handlers::projects::show))
        .route("/api/admin/projects/{id}", web::put().to(handlers::projects::update))
        .route("/api/admin/projects/{id}", web::delete().to(handlers::projects::destroy))

        // ── Tasks ──
        .route("/api/admin/tasks", web::get().to(handlers::tasks::index))
        .route("/api/admin/tasks/list", web::get().to(handlers::tasks::index))
        .route("/api/admin/tasks", web::post().to(handlers::tasks::store))
        .route("/api/admin/tasks/{id}", web::get().to(handlers::tasks::show))
        .route("/api/admin/tasks/{id}", web::put().to(handlers::tasks::update))
        .route("/api/admin/tasks/{id}", web::delete().to(handlers::tasks::destroy))
        .route("/api/admin/tasks/{id}/status", web::post().to(handlers::tasks::update_status))

        // ── Workflows ──
        .route("/api/admin/workflows", web::get().to(handlers::workflows::index))
        .route("/api/admin/workflows/list", web::get().to(handlers::workflows::index))
        .route("/api/admin/workflows", web::post().to(handlers::workflows::store))
        .route("/api/admin/workflows/{id}", web::get().to(handlers::workflows::show))
        .route("/api/admin/workflows/{id}", web::put().to(handlers::workflows::update))
        .route("/api/admin/workflows/{id}", web::delete().to(handlers::workflows::destroy))
        .route("/api/admin/workflows/{id}/toggle", web::post().to(handlers::workflows::toggle))

        // ── Careers ──
        .route("/api/admin/careers", web::get().to(handlers::careers::index))
        .route("/api/admin/careers/stats", web::get().to(handlers::careers::stats))
        .route("/api/admin/careers/list", web::get().to(handlers::careers::list))
        .route("/api/admin/careers", web::post().to(handlers::careers::store))
        .route("/api/admin/careers/{id}", web::get().to(handlers::careers::show))
        .route("/api/admin/careers/{id}", web::put().to(handlers::careers::update))
        .route("/api/admin/careers/{id}", web::delete().to(handlers::careers::destroy))

        // ── Job Applications ──
        .route("/api/admin/job-applications", web::get().to(handlers::job_applications::index))
        .route("/api/admin/job-applications/stats", web::get().to(handlers::job_applications::stats))
        .route("/api/admin/job-applications/list", web::get().to(handlers::job_applications::list))
        .route("/api/admin/job-applications", web::post().to(handlers::job_applications::store))
        .route("/api/admin/job-applications/{id}", web::get().to(handlers::job_applications::show))
        .route("/api/admin/job-applications/{id}", web::delete().to(handlers::job_applications::destroy))
        .route("/api/admin/job-applications/{id}/update-status", web::post().to(handlers::job_applications::update_status))
        .route("/api/admin/job-applications/{id}/send-email", web::post().to(handlers::job_applications::send_email))
        
        // ── Webhooks ──
        .route("/api/webhooks/incoming-resume", web::post().to(handlers::job_applications::webhook_incoming_resume))

        // ── Payroll ──
        .route("/api/admin/payroll", web::get().to(handlers::payroll::index))
        .route("/api/admin/payroll/list", web::get().to(handlers::payroll::list))
        .route("/api/admin/payroll/stats", web::get().to(handlers::payroll::stats))
        .route("/api/admin/payroll/employees", web::get().to(handlers::payroll::employees))


        // ── Reports ──
        .route("/api/admin/reports/stats", web::get().to(handlers::reports::stats))
        .route("/api/admin/reports/pipeline", web::get().to(handlers::reports::pipeline))
        .route("/api/admin/reports/lead-sources", web::get().to(handlers::reports::lead_sources))
        .route("/api/admin/reports/trends", web::get().to(handlers::reports::trends))

        // ── Salaries ──
        .route("/api/admin/salaries/components/list", web::get().to(handlers::salaries::components_list))
        .route("/api/admin/salaries/components", web::post().to(handlers::salaries::components_store))
        .route("/api/admin/salaries/components/{id}", web::put().to(handlers::salaries::components_update))
        .route("/api/admin/salaries/components/{id}", web::delete().to(handlers::salaries::components_destroy))
        .route("/api/admin/salaries/employees/list", web::get().to(handlers::salaries::employees_list))
        .route("/api/admin/salaries/employees/filter-options", web::get().to(handlers::salaries::employees_filter_options))

        // ── Centers (Settings) ──
        .route("/api/admin/settings/centers", web::get().to(handlers::centers::index))
        .route("/api/admin/api/settings/centers", web::get().to(handlers::centers::index))
        .route("/api/admin/settings/centers", web::post().to(handlers::centers::store))
        .route("/api/admin/settings/centers/{id}", web::put().to(handlers::centers::update))
        .route("/api/admin/settings/centers/{id}", web::delete().to(handlers::centers::destroy))

        // ── Settings ──
        .route("/api/admin/settings/app", web::get().to(handlers::settings::index))
        .route("/api/admin/settings/app", web::post().to(handlers::settings::update))
        .route("/api/admin/settings/app/logo", web::post().to(handlers::settings::upload_logo));
}

use actix_web::web;
use crate::handlers;

/// M-CARD / BIO-PARK ADMS push protocol — device calls /pub/chat (no JWT). Bound on BIOMETRIC_PORT.
pub fn configure_adms(cfg: &mut web::ServiceConfig) {
    cfg
        .route("/pub/chat", web::get().to(handlers::biometric::adms_chat_ws))
        .route("/pub/chat", web::post().to(handlers::biometric::adms_chat_post))
        .route("/pub/getrequest", web::get().to(handlers::biometric::adms_getrequest));
}

/// iClock / ADMS — device pushes attendance here (no JWT). Bound on BIOMETRIC_PORT (7788).
pub fn configure_iclock(cfg: &mut web::ServiceConfig) {
    cfg
        .route("/iclock/cdata", web::get().to(handlers::biometric::iclock_handshake))
        .route("/iclock/cdata", web::post().to(handlers::biometric::iclock_receive))
        .route("/iclock/getrequest", web::get().to(handlers::biometric::iclock_getrequest))
        .route("/iclock/devicecmd", web::post().to(handlers::biometric::iclock_devicecmd));
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg
        // Health check (enhanced for load balancers)
        .route("/api/health", web::get().to(handlers::health::health))
        .route("/api/openapi.json", web::get().to(handlers::openapi::openapi_json))

        // ── Auth ──
        .route("/api/auth/login", web::post().to(handlers::auth::login))
        .route("/api/auth/2fa/verify", web::post().to(handlers::two_factor::verify_login))
        .route("/api/auth/refresh", web::post().to(handlers::auth::refresh))
        .route("/api/auth/me", web::get().to(handlers::auth::me))
        .route("/api/auth/presence", web::post().to(handlers::auth::presence))
        .route("/api/auth/logout", web::post().to(handlers::auth::logout))
        .route("/api/auth/forgot-password", web::post().to(handlers::auth::forgot_password))
        .route(
            "/api/auth/verify-password-reset-otp",
            web::post().to(handlers::auth::verify_password_reset_otp),
        )
        .route("/api/auth/reset-password", web::post().to(handlers::auth::reset_password))
        .route(
            "/api/public/signup/check-availability",
            web::post().to(handlers::auth::check_signup_availability),
        )
        .route("/api/public/signup/send-otp", web::post().to(handlers::auth::send_signup_otp))
        .route("/api/public/signup", web::post().to(handlers::auth::signup))
        .route("/api/public/careers", web::get().to(handlers::careers::public_list))
        .route(
            "/api/public/desktop/updates/{tail:.*}",
            web::get().to(handlers::desktop_updates::serve),
        )
        .route("/api/onboarding/complete", web::post().to(handlers::settings::complete_onboarding))

        // ── Tenant two-factor (authenticated) ──
        .route("/api/two-factor/qr-code", web::get().to(handlers::two_factor::qr_code))
        .route("/api/two-factor/secret-key", web::get().to(handlers::two_factor::secret_key))
        .route("/api/two-factor/recovery-codes", web::get().to(handlers::two_factor::recovery_codes))
        .route("/api/two-factor/status", web::get().to(handlers::two_factor::status))
        .route("/api/two-factor/enable", web::post().to(handlers::two_factor::enable))
        .route("/api/two-factor/disable", web::post().to(handlers::two_factor::disable))

        // ── Platform (SaaS super admin) ──
        .route("/api/platform/auth/login", web::post().to(handlers::platform::login))
        .route("/api/platform/auth/me", web::get().to(handlers::platform::me))
        .route("/api/platform/auth/logout", web::post().to(handlers::platform::logout))
        .route("/api/platform/auth/2fa/setup", web::post().to(handlers::platform_team::two_factor_setup))
        .route("/api/platform/auth/2fa/enable", web::post().to(handlers::platform_team::two_factor_enable))
        .route("/api/platform/auth/2fa/disable", web::post().to(handlers::platform_team::two_factor_disable))
        .route("/api/platform/auth/2fa/verify", web::post().to(handlers::platform_team::two_factor_verify))
        .route("/api/platform/dashboard/stats", web::get().to(handlers::platform::dashboard_stats))
        .route("/api/platform/analytics/overview", web::get().to(handlers::platform_analytics::overview))
        .route("/api/platform/analytics/signups", web::get().to(handlers::platform_analytics::signups_timeseries))
        .route("/api/platform/analytics/plan-distribution", web::get().to(handlers::platform_analytics::plan_distribution))
        .route("/api/platform/analytics/expiring", web::get().to(handlers::platform_analytics::expiring))
        .route("/api/platform/analytics/geography", web::get().to(handlers::platform_analytics::geography))
        .route("/api/platform/analytics/devices", web::get().to(handlers::platform_analytics::devices_fleet))
        .route("/api/platform/search", web::get().to(handlers::platform_analytics::global_search))
        .route("/api/platform/system/health", web::get().to(handlers::platform_analytics::system_health))
        .route("/api/platform/invoices", web::get().to(handlers::platform_billing::invoices_index))
        .route("/api/platform/revenue/summary", web::get().to(handlers::platform_billing::revenue_summary))
        .route("/api/platform/invoices/{id}/mark-paid", web::post().to(handlers::platform_billing::mark_invoice_paid))
        .route("/api/platform/coupons", web::get().to(handlers::platform_billing::coupons_index))
        .route("/api/platform/coupons", web::post().to(handlers::platform_billing::coupons_store))
        .route("/api/platform/coupons/{id}", web::delete().to(handlers::platform_billing::coupons_destroy))
        .route("/api/platform/upgrade-requests", web::get().to(handlers::platform_billing::upgrade_requests_index))
        .route("/api/platform/upgrade-requests/{id}/approve", web::post().to(handlers::platform_billing::upgrade_request_approve))
        .route("/api/platform/upgrade-requests/{id}/reject", web::post().to(handlers::platform_billing::upgrade_request_reject))
        .route("/api/platform/kb", web::get().to(handlers::platform_support::kb_index))
        .route("/api/platform/kb", web::post().to(handlers::platform_support::kb_store))
        .route("/api/platform/kb/{id}", web::patch().to(handlers::platform_support::kb_update))
        .route("/api/platform/kb/{id}", web::delete().to(handlers::platform_support::kb_destroy))
        .route("/api/platform/support/tickets/stats", web::get().to(handlers::platform_support::tickets_stats))
        .route("/api/platform/support/tickets", web::get().to(handlers::platform_support::tickets_index))
        .route("/api/platform/support/tickets/{id}", web::patch().to(handlers::platform_support::tickets_update))
        .route("/api/platform/organizations/{id}/export", web::get().to(handlers::platform_export::organization_export))
        .route("/api/webhooks/razorpay", web::post().to(handlers::webhooks::razorpay_webhook))
        .route("/api/platform/users", web::get().to(handlers::platform::users_index))
        .route("/api/platform/ip-tracking", web::get().to(handlers::platform::ip_tracking_index))
        .route("/api/platform/audit-log", web::get().to(handlers::platform_audit::audit_log_index))
        .route("/api/platform/team", web::get().to(handlers::platform_team::team_index))
        .route("/api/platform/team", web::post().to(handlers::platform_team::team_store))
        .route("/api/platform/team/{id}", web::patch().to(handlers::platform_team::team_update))
        .route("/api/platform/team/{id}", web::delete().to(handlers::platform_team::team_destroy))
        .route("/api/platform/team/{id}/reset-password", web::post().to(handlers::platform_team::team_reset_password))
        .route("/api/platform/sessions", web::get().to(handlers::platform_team::sessions_index))
        .route("/api/platform/sessions/{id}", web::delete().to(handlers::platform_team::sessions_revoke))
        .route("/api/platform/announcements", web::get().to(handlers::platform_content::announcements_index))
        .route("/api/platform/announcements", web::post().to(handlers::platform_content::announcements_store))
        .route("/api/platform/announcements/upload-banner", web::post().to(handlers::platform_content::announcements_upload_banner))
        .route("/api/platform/announcements/{id}", web::patch().to(handlers::platform_content::announcements_update))
        .route("/api/platform/announcements/{id}", web::delete().to(handlers::platform_content::announcements_destroy))
        .route("/api/platform/files/{tail:.*}", web::get().to(handlers::files::platform_serve))
        .route("/api/platform/releases", web::get().to(handlers::platform_content::releases_index))
        .route("/api/platform/releases", web::post().to(handlers::platform_content::releases_store))
        .route("/api/platform/releases/{id}", web::patch().to(handlers::platform_content::releases_update))
        .route("/api/platform/releases/{id}", web::delete().to(handlers::platform_content::releases_destroy))
        .route(
            "/api/platform/releases/{id}/desktop-installer",
            web::post().to(handlers::desktop_updates::platform_upload_installer),
        )
        .route(
            "/api/platform/desktop-update/status",
            web::get().to(handlers::desktop_updates::platform_feed_status),
        )
        .route("/api/platform/plans", web::get().to(handlers::subscription_plans::index))
        .route("/api/platform/plans/modules", web::get().to(handlers::subscription_plans::modules_catalog))
        .route("/api/platform/plans", web::post().to(handlers::subscription_plans::store))
        .route("/api/platform/plans/{id}", web::patch().to(handlers::subscription_plans::update))
        .route("/api/platform/plans/{id}", web::delete().to(handlers::subscription_plans::destroy))
        .route("/api/platform/organizations", web::get().to(handlers::platform::organizations_index))
        .route("/api/platform/organizations", web::post().to(handlers::platform::organizations_store))
        .route("/api/platform/organizations/{id}", web::get().to(handlers::platform::organizations_show))
        .route("/api/platform/organizations/{id}", web::patch().to(handlers::platform::organizations_update))
        .route("/api/platform/organizations/{id}", web::delete().to(handlers::platform::organizations_destroy))
        .route(
            "/api/platform/organizations/{id}/impersonate",
            web::post().to(handlers::platform::organizations_impersonate),
        )
        .route("/api/platform/organizations/{id}/notes", web::get().to(handlers::platform_content::org_notes_index))
        .route("/api/platform/organizations/{id}/notes", web::post().to(handlers::platform_content::org_notes_store))
        .route("/api/platform/organizations/{id}/notes/{note_id}", web::delete().to(handlers::platform_content::org_notes_destroy))
        .route("/api/platform/organizations/{id}/feature-overrides", web::get().to(handlers::platform_content::feature_overrides_index))
        .route("/api/platform/organizations/{id}/feature-overrides", web::put().to(handlers::platform_content::feature_overrides_upsert))
        .route("/api/platform/organizations/{id}/feature-overrides/{module}", web::delete().to(handlers::platform_content::feature_overrides_delete))
        // ── Tenant detail (drill-down per organization) ──
        .route("/api/platform/organizations/{id}/overview", web::get().to(handlers::platform_tenant::tenant_overview))
        .route("/api/platform/organizations/{id}/users", web::get().to(handlers::platform_tenant::tenant_users))
        .route("/api/platform/organizations/{id}/devices", web::get().to(handlers::platform_tenant::tenant_devices))
        .route("/api/platform/organizations/{id}/payroll", web::get().to(handlers::platform_tenant::tenant_payroll))
        .route("/api/platform/organizations/{id}/attendance", web::get().to(handlers::platform_tenant::tenant_attendance))
        .route("/api/platform/organizations/{id}/settings", web::get().to(handlers::platform_tenant::tenant_settings))
        .route("/api/platform/organizations/{id}/audit", web::get().to(handlers::platform_tenant::tenant_audit))
        // Per-user actions from platform admin
        .route("/api/platform/users/{id}/force-logout", web::post().to(handlers::platform_tenant::force_logout_user))
        .route("/api/platform/users/{id}/reset-password", web::post().to(handlers::platform_tenant::reset_user_password))
        .route("/api/platform/users/{id}/suspend", web::post().to(handlers::platform_tenant::suspend_user))
        .route("/api/platform/users/{id}/unsuspend", web::post().to(handlers::platform_tenant::unsuspend_user))
        // Tenant-side public reads (announcements + releases)
        .route("/api/admin/announcements", web::get().to(handlers::platform_content::tenant_announcements_index))
        .route("/api/admin/org-notifications", web::get().to(handlers::org_notifications::inbox))
        .route("/api/admin/org-notifications", web::post().to(handlers::org_notifications::store))
        .route("/api/admin/org-notifications/unread-count", web::get().to(handlers::org_notifications::unread_count))
        .route("/api/admin/org-notifications/upload-banner", web::post().to(handlers::org_notifications::upload_banner))
        .route("/api/admin/org-notifications/sent", web::get().to(handlers::org_notifications::sent_index))
        .route("/api/admin/org-notifications/{id}/read", web::post().to(handlers::org_notifications::mark_read))
        .route("/api/admin/org-notifications/{id}/dismiss", web::post().to(handlers::org_notifications::dismiss))
        .route("/api/admin/releases", web::get().to(handlers::platform_content::tenant_releases_index))
        .route("/api/admin/billing/plans", web::get().to(handlers::tenant_billing::available_plans))
        .route("/api/admin/billing/upgrade-request", web::get().to(handlers::tenant_billing::my_upgrade_request))
        .route("/api/admin/billing/upgrade-request", web::post().to(handlers::tenant_billing::submit_upgrade_request))
        .route("/api/admin/kb", web::get().to(handlers::tenant_billing::tenant_kb_index))
        .route("/api/admin/support/tickets", web::get().to(handlers::tenant_billing::tenant_tickets_index))
        .route("/api/admin/support/tickets", web::post().to(handlers::tenant_billing::tenant_ticket_store))

        // ── Dashboard Analytics ──
        .route("/api/admin/dashboard/hr-data", web::get().to(handlers::analytics::hr_dashboard))

        // ── Users ──
        .route("/api/admin/users", web::get().to(handlers::users::index))
        .route("/api/admin/users/stats", web::get().to(handlers::users::stats))
        .route("/api/admin/users/list", web::get().to(handlers::users::list))
        .route("/api/admin/users", web::post().to(handlers::users::store))
        .route("/api/admin/users/{id}/salary-structure", web::get().to(handlers::salaries::user_salary_structure_show))
        .route("/api/admin/users/{id}/salary-structure", web::post().to(handlers::salaries::user_salary_structure_store))
        .route("/api/admin/users/{id}/ctc-profile", web::get().to(handlers::salaries::user_ctc_profile_show))
        .route("/api/admin/users/{id}/ctc-profile", web::post().to(handlers::salaries::user_ctc_profile_store))
        .route("/api/admin/users/{id}/ctc-profile", web::delete().to(handlers::salaries::user_ctc_profile_destroy))
        .route("/api/admin/users/{id}/advances", web::get().to(handlers::salaries::advances_list))
        .route("/api/admin/users/{id}/advances", web::post().to(handlers::salaries::advances_store))
        .route("/api/admin/users/{id}", web::get().to(handlers::users::show))
        .route("/api/admin/users/{id}", web::put().to(handlers::users::update))
        .route("/api/admin/users/{id}", web::post().to(handlers::users::update_form))
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
        .route("/api/admin/attendance/manual", web::post().to(handlers::attendance::store_manual))
        .route("/api/admin/attendance/manual/bulk", web::post().to(handlers::attendance::store_manual_bulk))
        .route("/api/admin/attendance/{id}", web::patch().to(handlers::attendance::update))
        .route("/api/admin/attendance/{id}", web::delete().to(handlers::attendance::destroy))

        // ── Shifts (Phase 1) ──
        .route("/api/admin/shifts", web::get().to(handlers::shifts::index))
        .route("/api/admin/shifts", web::post().to(handlers::shifts::store))
        .route("/api/admin/shifts/{id}", web::put().to(handlers::shifts::update))
        .route("/api/admin/shifts/{id}", web::delete().to(handlers::shifts::destroy))
        .route("/api/admin/shifts/assign-user", web::post().to(handlers::shifts::assign_user))
        .route("/api/admin/shifts/roster", web::get().to(handlers::shifts::roster))
        .route("/api/admin/shifts/daily-roster", web::get().to(handlers::shifts::daily_roster_show))
        .route("/api/admin/shifts/daily-roster", web::post().to(handlers::shifts::daily_roster_store))
        .route("/api/admin/shifts/user/{id}", web::get().to(handlers::shifts::user_assignment))

        // ── Leave Requests ──
        .route("/api/admin/leave-types", web::get().to(handlers::leave_types::index))
        .route("/api/admin/settings/leave-types", web::get().to(handlers::leave_types::settings_list))
        .route("/api/admin/settings/leave-types", web::post().to(handlers::leave_types::store))
        .route("/api/admin/settings/leave-types/{id}", web::put().to(handlers::leave_types::update))
        .route("/api/admin/settings/leave-policy", web::get().to(handlers::leave_credits::policy_show))
        .route("/api/admin/settings/leave-policy", web::put().to(handlers::leave_credits::policy_update))
        .route("/api/admin/leave-credits", web::get().to(handlers::leave_credits::index))
        .route("/api/admin/leave-credits", web::post().to(handlers::leave_credits::store))
        .route("/api/admin/leave-credits/{id}", web::delete().to(handlers::leave_credits::destroy))
        .route("/api/admin/leave-requests", web::get().to(handlers::leave_requests::index))
        .route("/api/admin/leave-requests/list", web::get().to(handlers::leave_requests::list))
        .route("/api/admin/leave-requests/stats", web::get().to(handlers::leave_requests::stats))
        .route("/api/admin/leave-requests", web::post().to(handlers::leave_requests::store))
        .route("/api/admin/leave-requests/{id}", web::put().to(handlers::leave_requests::update))
        .route("/api/admin/leave-requests/{id}", web::delete().to(handlers::leave_requests::destroy))
        .route("/api/admin/leave-requests/manage", web::get().to(handlers::leave_requests::manage))
        .route("/api/admin/leave-requests/manage/list", web::get().to(handlers::leave_requests::list_all))
        .route("/api/admin/leave-requests/manage/stats", web::get().to(handlers::leave_requests::admin_stats))
        .route("/api/admin/leave-requests/{id}/approve", web::post().to(handlers::leave_requests::approve))
        .route("/api/admin/leave-requests/{id}/reject", web::post().to(handlers::leave_requests::reject))
        .route("/api/admin/leave-requests/{id}/remarks", web::put().to(handlers::leave_requests::update_remarks))

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
        .route("/api/admin/workflows/{id}/duplicate", web::post().to(handlers::workflows::duplicate))
        .route("/api/admin/workflows/{id}/executions", web::get().to(handlers::workflows::executions))

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

        // ── Reports ──
        .route("/api/admin/reports/attendance-summary", web::get().to(handlers::reports::attendance_summary))
        .route("/api/admin/reports/daily-attendance", web::get().to(handlers::reports::daily_attendance_register))
        .route("/api/admin/reports/attendance-register", web::get().to(handlers::reports::attendance_register))
        .route("/api/admin/reports/attendance", web::get().to(handlers::reports::attendance_register))
        .route("/api/admin/reports/employee-attendance-log", web::get().to(handlers::reports::employee_attendance_log))
        .route("/api/admin/reports/payroll-register", web::get().to(handlers::reports::payroll_register))
        .route("/api/admin/reports/payroll-split", web::get().to(handlers::reports::payroll_split))
        .route("/api/admin/reports/leave-balance", web::get().to(handlers::reports::leave_balance))

        // ── Payroll ──
        .route("/api/admin/payroll", web::get().to(handlers::payroll::index))
        .route("/api/admin/payroll/list", web::get().to(handlers::payroll::list))
        .route("/api/admin/payroll/stats", web::get().to(handlers::payroll::stats))
        .route("/api/admin/payroll/employees", web::get().to(handlers::payroll::employees))
        .route("/api/admin/payroll/preview", web::post().to(handlers::payroll::preview))
        .route("/api/admin/payroll/generate", web::post().to(handlers::payroll::generate))
        .route("/api/admin/payslips/{id}/unlock", web::post().to(handlers::payroll::unlock_payslip))
        .route("/api/admin/payroll/variable-pay", web::get().to(handlers::payroll_advanced::variable_pay_list))
        .route("/api/admin/payroll/variable-pay", web::post().to(handlers::payroll_advanced::variable_pay_store))
        .route("/api/admin/payroll/variable-pay/{id}", web::delete().to(handlers::payroll_advanced::variable_pay_destroy))
        .route("/api/admin/payroll/reimbursements", web::get().to(handlers::payroll_advanced::reimbursement_list))
        .route("/api/admin/payroll/reimbursements", web::post().to(handlers::payroll_advanced::reimbursement_store))
        .route("/api/admin/payroll/reimbursements/{id}/review", web::post().to(handlers::payroll_advanced::reimbursement_review))
        .route("/api/admin/payroll/runs", web::get().to(handlers::payroll_advanced::payroll_runs_list))
        .route("/api/admin/payroll/runs", web::post().to(handlers::payroll_advanced::payroll_run_store))
        .route("/api/admin/payroll/runs/{id}/action", web::post().to(handlers::payroll_advanced::payroll_run_action))
        .route("/api/admin/payroll/checklist", web::get().to(handlers::payroll_advanced::payroll_checklist))
        .route("/api/admin/payroll/reminder", web::get().to(handlers::payroll_advanced::payroll_reminder_status))
        .route("/api/admin/payroll/compliance-export", web::get().to(handlers::payroll_advanced::compliance_export))
        .route("/api/admin/payroll/bank-file", web::get().to(handlers::payroll_advanced::bank_payment_file))
        .route("/api/admin/payroll/mark-paid", web::post().to(handlers::payroll_advanced::mark_payslips_paid))
        .route("/api/admin/payroll/accounting-export", web::get().to(handlers::payroll_advanced::accounting_journal_export))
        .route("/api/admin/payroll/pay-groups", web::get().to(handlers::payroll_advanced::pay_groups_list))
        .route("/api/admin/payroll/pay-groups", web::post().to(handlers::payroll_advanced::pay_group_store))
        .route("/api/admin/users/{id}/payroll-hold", web::post().to(handlers::payroll_advanced::set_payroll_hold))
        .route("/api/admin/users/{id}/tax-declaration/{fy}", web::get().to(handlers::payroll_advanced::tax_declaration_get))
        .route("/api/admin/users/{id}/tax-declaration", web::post().to(handlers::payroll_advanced::tax_declaration_save))


        // ── Salaries ──
        .route("/api/admin/salaries/components/list", web::get().to(handlers::salaries::components_list))
        .route("/api/admin/salaries/components", web::post().to(handlers::salaries::components_store))
        .route("/api/admin/salaries/components/{id}", web::put().to(handlers::salaries::components_update))
        .route("/api/admin/salaries/components/{id}", web::delete().to(handlers::salaries::components_destroy))
        .route("/api/admin/salaries/templates", web::get().to(handlers::salaries::templates_list))
        .route("/api/admin/salaries/ctc-preview", web::post().to(handlers::salaries::ctc_preview))
        .route("/api/admin/salaries/employees/list", web::get().to(handlers::salaries::employees_list))
        .route("/api/admin/salaries/employees/filter-options", web::get().to(handlers::salaries::employees_filter_options))
        .route("/api/admin/me/payslips", web::get().to(handlers::payslips::my_payslips_list))
        .route("/api/admin/salaries/employees/{id}/payslips/list", web::get().to(handlers::payslips::employee_payslips_list))
        .route("/api/admin/payslips/{id}/send-whatsapp", web::post().to(handlers::payslips::send_whatsapp))
        .route("/api/admin/payslips/{id}/send-email", web::post().to(handlers::payslips::send_email))
        .route("/api/admin/payslips/bulk-send-email", web::post().to(handlers::payslips::bulk_send_email))
        .route("/api/admin/payslips/{id}/pdf", web::get().to(handlers::payslips::payslip_pdf))
        .route("/api/admin/payslips/bulk-download", web::post().to(handlers::payslips::bulk_download))

        // ── Doctor Reports ──
        .route("/api/admin/doctor-reports", web::get().to(handlers::doctor_reports::index))
        .route("/api/admin/doctor-reports", web::post().to(handlers::doctor_reports::store))
        .route("/api/admin/me/doctor-reports", web::get().to(handlers::doctor_reports::my_reports))
        .route("/api/admin/doctor-reports/{id}", web::get().to(handlers::doctor_reports::show))
        .route("/api/admin/doctor-reports/{id}", web::put().to(handlers::doctor_reports::update))
        .route("/api/admin/doctor-reports/{id}", web::delete().to(handlers::doctor_reports::destroy))
        .route("/api/admin/doctor-reports/{id}/prescription", web::post().to(handlers::doctor_reports::upload_prescription))

        // ── Grocery Benefits ──
        .route("/api/admin/grocery-benefits", web::get().to(handlers::grocery_benefits::index))
        .route("/api/admin/grocery-benefits", web::post().to(handlers::grocery_benefits::store))
        .route("/api/admin/grocery-benefits/my-status", web::get().to(handlers::grocery_benefits::my_status))
        .route("/api/admin/grocery-benefits/{id}", web::put().to(handlers::grocery_benefits::update))
        .route("/api/admin/grocery-benefits/{id}", web::delete().to(handlers::grocery_benefits::destroy))
        .route("/api/admin/grocery-claims", web::get().to(handlers::grocery_benefits::claims_index))
        .route("/api/admin/grocery-claims", web::post().to(handlers::grocery_benefits::claims_store))
        .route("/api/admin/grocery-claims/{id}/review", web::post().to(handlers::grocery_benefits::claims_review))

        // ── Centers (Settings) ──
        .route("/api/admin/settings/centers", web::get().to(handlers::centers::index))
        .route("/api/admin/settings/centers", web::post().to(handlers::centers::store))
        .route("/api/admin/settings/centers/{id}", web::put().to(handlers::centers::update))
        .route("/api/admin/settings/centers/{id}", web::delete().to(handlers::centers::destroy))

        // ── Settings ──
        .route("/api/admin/settings/app", web::get().to(handlers::settings::index))
        .route("/api/admin/settings/app", web::post().to(handlers::settings::update))
        .route("/api/admin/settings/app/logo", web::post().to(handlers::settings::upload_logo))
        .route("/api/admin/settings/password", web::put().to(handlers::settings::update_password))
        .route("/api/admin/settings/profile", web::patch().to(handlers::settings::update_profile))
        .route("/api/admin/settings/profile/photo", web::post().to(handlers::settings::update_profile_photo))
        .route("/api/admin/settings/profile", web::post().to(handlers::settings::update_profile))

        // ── Biometric Admin API (Authenticated) ──
        // iClock device endpoints are only on BIOMETRIC_PORT (7788), not the main API port.
        .route("/api/admin/biometric/devices", web::get().to(handlers::biometric::devices_list))
        .route("/api/admin/biometric/devices", web::post().to(handlers::biometric::devices_store))
        .route("/api/admin/biometric/devices/{id}", web::delete().to(handlers::biometric::devices_destroy))
        .route("/api/admin/biometric/punches", web::get().to(handlers::biometric::punches_list))
        .route("/api/admin/biometric/mapping", web::get().to(handlers::biometric::mapping_list))
        .route("/api/admin/biometric/mapping", web::post().to(handlers::biometric::mapping_store))
        .route("/api/admin/biometric/mapping/{id}", web::delete().to(handlers::biometric::mapping_destroy))
        .route("/api/admin/biometric/stats", web::get().to(handlers::biometric::biometric_stats))
        .route("/api/admin/biometric/ws", web::get().to(handlers::biometric::biometric_live_ws))

        // ── Team Chat ──
        .route("/api/admin/chat/spaces", web::get().to(handlers::chat::spaces_index))
        .route("/api/admin/chat/channels", web::post().to(handlers::chat::channels_store))
        .route("/api/admin/chat/channels/{id}", web::patch().to(handlers::chat::channels_update))
        .route("/api/admin/chat/channels/{id}/join", web::post().to(handlers::chat::channels_join))
        .route("/api/admin/chat/channels/{id}/leave", web::post().to(handlers::chat::channels_leave))
        .route("/api/admin/chat/channels/{id}/members", web::post().to(handlers::chat::channels_add_members))
        .route("/api/admin/chat/dm", web::post().to(handlers::chat::dm_store))
        .route("/api/admin/chat/spaces/{id}/messages", web::get().to(handlers::chat::messages_index))
        .route("/api/admin/chat/spaces/{id}/messages", web::post().to(handlers::chat::messages_store))
        .route("/api/admin/chat/spaces/{id}/read", web::post().to(handlers::chat::spaces_mark_read))
        .route("/api/admin/chat/spaces/{id}/pins", web::get().to(handlers::chat::pins_index))
        .route("/api/admin/chat/messages/{id}", web::patch().to(handlers::chat::messages_update))
        .route("/api/admin/chat/messages/{id}", web::delete().to(handlers::chat::messages_destroy))
        .route("/api/admin/chat/messages/{id}/reactions", web::post().to(handlers::chat::messages_react))
        .route("/api/admin/chat/messages/{id}/pin", web::post().to(handlers::chat::messages_pin))
        .route("/api/admin/chat/messages/{id}/star", web::post().to(handlers::chat::messages_star))
        .route("/api/admin/chat/search", web::get().to(handlers::chat::search))
        .route("/api/admin/chat/starred", web::get().to(handlers::chat::starred_index))
        .route("/api/admin/chat/users", web::get().to(handlers::chat::users_index))
        .route("/api/admin/chat/upload", web::post().to(handlers::chat::upload))
        .route("/api/admin/chat/ws", web::get().to(handlers::chat::chat_ws))

        // ── Assets & Maintenance ──
        .route("/api/admin/assets", web::get().to(handlers::assets::index))
        .route("/api/admin/assets", web::post().to(handlers::assets::store))
        .route("/api/admin/assets/{id}", web::put().to(handlers::assets::update))
        .route("/api/admin/assets/{id}", web::delete().to(handlers::assets::destroy))
        .route("/api/admin/asset-allocations", web::get().to(handlers::assets::allocations_index))
        .route("/api/admin/asset-allocations", web::post().to(handlers::assets::allocate))
        .route("/api/admin/asset-allocations/{id}/return", web::post().to(handlers::assets::process_return))
        .route("/api/admin/asset-expenses", web::get().to(handlers::assets::expenses_index))
        .route("/api/admin/asset-expenses/{id}/review", web::post().to(handlers::assets::expenses_review))
        .route("/api/admin/my-assets", web::get().to(handlers::assets::my_assets))
        .route("/api/admin/my-assets/expenses", web::post().to(handlers::assets::my_assets_store_expense))

        // ── Authenticated file storage ──
        .route("/api/admin/files/{tail:.*}", web::get().to(handlers::files::serve));
}

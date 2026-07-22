# QA Deep Audit + Fixes — 2026-07-22

Full read-first-then-fix pass across workflow, business logic, code quality, database, RBAC, and security. Companion to the green baseline in [FULL-PROJECT-TEST-2026-07-21.md](FULL-PROJECT-TEST-2026-07-21.md) — this pass goes beyond "green tests" to find real defects and fix them in the same commit.

## Summary

**Result: 8 real defects fixed, 3 DB integrity issues resolved, 3 dead-code / cleanup items removed. All existing tests still green (101 Rust + 35 Vitest). One net-new regression test added.**

Two remotes on `main`: `origin` → `guru177/clienthrm`, `hrm-rust` → `guru177/hrm-rust`.

## Findings

| ID | Severity | Area | File:line | Repro | Fix |
|----|----------|------|-----------|-------|-----|
| F1 | **Critical** | Doctor reports RBAC | `backend/src/handlers/doctor_reports.rs:302` (old) | An HR admin with `edit-doctor-reports` but not the authoring doctor and not super-admin: the nested `!has_permission(edit-doctor-reports) \|\| !is_super` short-circuits to `true` when `is_super=false`, so the innermost branch always returns 403. The `edit-doctor-reports` permission is silently dead for non-super-admins. | Rewrote the branch to: allow when actor is doctor author, super-admin, or has `edit-doctor-reports`. |
| F2 | **High** | Storage authz — HR docs | `backend/src/storage.rs:195` (old) | Any authenticated org member could GET `/api/admin/files/user-docs/<uuid>.pdf` for another employee's Aadhaar/PAN/ID proof/other docs — the SQL only checked "path exists in the org" without checking who the caller is. | Rewrote `can_access_storage_file` `user-docs/` branch: allow only the owning employee, super-admins, or actors with `view-users` / `edit-users`. |
| F3 | **High** | Leave — self-approval | `backend/src/handlers/leave_requests.rs::approve` | A user granted both `create-leave-requests` and `approve-leave-requests` could approve their own leave. `approve()` never compared `claims.sub` to `leave.user_id`. | Reject with 403 when actor == submitter, unless super-admin. Same guard added to `reject()`. |
| F4 | **Medium** | Auth bootstrap 403 clears session | `frontend/src/contexts/AuthContext.tsx:98-103` | `isAuthFailure` treated both 401 **and 403** as "kill the token". A transient 403 on `/auth/me` (e.g. subscription/plan gate) would nuke the session and force a re-login. | Only match 401 (and the literal `Unauthorized` thrown after a failed refresh). Regression test added. |
| F5 | **Medium** | `apiUpload` doesn't refresh on 401 | `frontend/src/lib/api.ts::apiUpload` | File uploads with an expired token failed with a raw 401 toast — no refresh, no retry. Users had to log out/in. | Mirror `apiFetch` refresh flow: call `tryRefreshToken()`, retry once, otherwise clear + redirect. |
| F6 | **Medium** | Manual attendance future-date | `backend/src/handlers/attendance.rs::insert_manual_record` | A user with `mark-attendance` could POST attendance for `2099-01-01`. No upper bound check. | Parse the date and reject when `date > today` (backdate remains allowed — regularization is a real need). |
| F7 | **Low** | Middleware RBAC gap (documented, not fixed) | `backend/src/middleware/rbac.rs::required_permission` | `/api/admin/assets/*`, `/api/admin/asset-allocations/*`, `/api/admin/grocery-benefits/*`, `/api/admin/grocery-claims/*` return `None` — no middleware gate. | Documented as intentional: these prefixes mix admin management with employee self-service (e.g. `grocery-claims` POST is employee, `grocery-claims/{id}/review` POST is admin). Each handler enforces the correct slug; verified in the sweep. Comment added inline. |
| F8 | **Low** | Deprecated dead endpoint | `backend/src/handlers/settings.rs::upload_logo`, `backend/src/routes.rs` | `POST /api/admin/settings/app/logo` was a "Deprecated" stub with no callers. | Removed handler + route. |
| F9 | **Low** | Dead frontend pages | `frontend/src/pages/admin/team/{attendance,leave}.tsx` | Both files existed but no import or router entry referenced them. | Deleted files + empty `team/` directory. |
| F10 | **Low** | Silent catch swallow | `frontend/src/pages/admin/payroll/index.tsx::fetchDepartments`, `fetchCenters` | `catch (e) { /* ignore */ }` — a startup 403 silently produced empty dropdowns with no signal in DevTools. | Log a `console.warn` and clear state instead of eating the error. Toast still suppressed because the payroll page opens before filters are chosen — a toast would be noise. |

### Database integrity — found + fixed on the running DB

| ID | Table | Was | Fix |
|----|-------|-----|-----|
| D1 | `role_user(user_id, role_id)` | No unique index. `sync_role_defaults` ran `ON CONFLICT DO NOTHING` **without a conflict target**, so PG treated it as "no conflict"; every sync duplicated every membership. Actual DB had ≥10 duplicate pairs. | New migration `migrate_role_user_unique`: dedupe by keeping min `id`, then `CREATE UNIQUE INDEX idx_role_user_user_role_unique`. Wired in `postgres_bootstrap.rs`. Manually applied to live DB (11 rows removed). |
| D2 | `payslips(user_id, month, year)` | No unique index. Payslip regeneration could create sibling rows for the same period. | New migration `migrate_payslips_unique`: dedupe keeping the row with max `updated_at` (then max `id`), then `CREATE UNIQUE INDEX payslips_user_month_year_unique`. Wired in `postgres_bootstrap.rs`. Applied to live DB (0 dupes existed — new orgs are protected). |
| D3 | `users(organization_id, LOWER(email))` | Unique index deferred by `migrate_users_unique_org_email` because 3 real duplicate emails exist (org 117 × `guruprasad6282@gmail.com`, org 120 × QA test-employee ×7, org 121 × 1 QA test account). | **Not auto-fixed** — leaving to manual triage since two duplicate rows may be two separate real people. Migration already logs a warning on every boot until resolved; noted here so the resolution path is explicit. |

### Verified-clean items (probed, found no issue)

- **Task/project tenant isolation** (`handlers/tasks.rs`, `handlers/projects.rs`) — every SELECT/UPDATE/DELETE is scoped by `organization_id`. `validate_task_refs` blocks cross-tenant assignee/project references.
- **Payslip PDF authz** (`handlers/payslips.rs::payslip_pdf`) — correctly gates on owner OR `view-payroll` / `manage-payroll` and status='generated'.
- **Manager approval routes** (`handlers/manager.rs`) — enforce `is_direct_report(manager_id, user_id, org_id)`; a user can't be their own manager (validated at user CRUD), so self-approval via this path is impossible.
- **Razorpay webhook** (`handlers/webhooks.rs`) — HMAC-SHA256 verified before touching DB; missing secret returns 503.
- **Public signup / login rate limits** (`rate_limit.rs`) — `limit_public_signup` 5/hr, `limit_auth_login` 20/15min, sliding window, Redis-backed when configured.
- **Storage traversal** — `normalize_relative_path` rejects `..` and empty paths; unit-tested.
- **Dynamic identifiers in `platform_analytics.rs`** — `format!("SELECT COUNT(*) FROM {}", table)` uses a hardcoded array of table names, no user input.
- **Dynamic column updates in `handlers/settings.rs::update_profile`, `complete_onboarding`, and `handlers/users.rs::update`** — every `format!` uses a compile-time allow-list of column names.
- **Duplicate refresh flows** (`api.ts` vs `axios.ts`) — both use single-flight `refreshInFlight`; not consolidated in this pass because both call the same `/auth/refresh` and set the same `localStorage` keys, so drift is bounded.

## Files changed

- `backend/src/handlers/doctor_reports.rs` — F1 permission logic
- `backend/src/storage.rs` — F2 user-docs privacy
- `backend/src/handlers/leave_requests.rs` — F3 approve/reject self-guard
- `backend/src/handlers/attendance.rs` — F6 future-date reject
- `backend/src/middleware/rbac.rs` — F7 clarifying comment
- `backend/src/handlers/settings.rs`, `backend/src/routes.rs` — F8 dead endpoint removed
- `backend/src/db/migrations.rs`, `backend/src/db/postgres_bootstrap.rs` — D1, D2 new migrations
- `frontend/src/contexts/AuthContext.tsx` — F4 only 401 clears
- `frontend/src/contexts/AuthContext.test.tsx` — new regression test
- `frontend/src/lib/api.ts` — F5 apiUpload refresh
- `frontend/src/pages/admin/payroll/index.tsx` — D4 silent catch replaced with warn
- `frontend/src/pages/admin/team/` — F9 deleted

## Verification

- `cargo test --release` — **101 passed, 0 failed, 1 ignored** (103s).
- `npm test -- --run` — **35 passed / 8 files** (up from 34 — one net-new AuthContext test).
- `cargo check` — clean; only pre-existing `never used` warnings on legacy migration helpers, no regressions.

## Non-goals for this pass

- No new module UI, no platform (`:5175`) refactor, no Caddy / Docker Compose change.
- No EXE / APK rebuild — none of the runtime changes affect the Electron shell; the 2026-07-21 artifacts remain valid until the next release cut.
- Duplicate emails in orgs 117/120/121 left for manual triage (see D3).

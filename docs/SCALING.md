# SaaS Database Scaling Guide

This document complements [PRODUCTION.md](PRODUCTION.md) with database performance and scale-out practices for large tenants (5k+ employees) and many organizations.

## Phase 1 — Hot-path indexes

Applied automatically on startup via `backend/src/db/scalability.rs`:

| Index | Table |
|-------|--------|
| `idx_attendance_user_date` | `attendance(user_id, date)` active rows |
| `idx_attendance_org_date` | `attendance(organization_id, date)` |
| `idx_leave_requests_user_status_dates` | leave overlap + payroll |
| `idx_leave_requests_org_status_start` | manage-leave lists |
| `idx_payslips_org_period` | payroll register |
| `idx_holidays_org_date` | paid holidays |
| `idx_bio_punches_org_time` / `idx_bio_punches_user_time` | biometric sync |
| `idx_users_org_active` | employee lists |

Verify: `python scripts/test-database-health.py` (SQLite + optional PostgreSQL via `DATABASE_URL`).

## Phase 2 — Payroll batching

`payroll_month_context::MonthContext::prefetch` loads attendance, leave, holidays, and shift/roster data in bulk for payroll preview. Used by `/api/admin/payroll/preview` and employee payroll list.

Benchmark: `python scripts/load-test-payroll.py`

## Phase 3 — PostgreSQL pool tuning

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_POOL_MAX_SIZE` | 50 (PG), 10 (SQLite) | r2d2 pool size |
| `DB_STATEMENT_TIMEOUT_MS` | 30000 | Kill runaway queries |
| `DB_IDLE_IN_TX_TIMEOUT_MS` | 60000 | Release stuck transactions |
| `DATABASE_READ_URL` | — | Optional read replica |

Use PgBouncer when running multiple API replicas: `max_connections ≈ replicas × DB_POOL_MAX_SIZE`.

## Phase 4 — Partitioning & retention

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENABLE_PG_PARTITIONING` | off | Create monthly partitions when parent tables are partitioned |
| `DATA_RETENTION_DAYS` | 730 | Audit log + processed punch retention |
| `RETENTION_WORKER_INTERVAL_HOURS` | 24 | Background retention job |

Tables targeted for partitioning: `biometric_punches`, `attendance`, `platform_audit_log`.

## Phase 5 — Row-level security

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENABLE_PG_RLS` | off | Tenant isolation policies on `users`, `attendance`, `leave_requests`, `payslips` |

Use `DbPool::get_for_tenant(org_id)` in handlers when RLS is enabled.

## Phase 6 — Background workers

Started automatically in `main.rs`:

| Worker | Env | Interval |
|--------|-----|----------|
| Biometric sync | `BIOMETRIC_WORKER_INTERVAL_SECS` | 60s |
| Data retention | `RETENTION_WORKER_INTERVAL_HOURS` | 24h |
| Payroll queue | `PAYROLL_QUEUE_POLL_SECS` | 30s |

Payroll async: set `payroll_runs.status = 'queued'`; worker moves to `draft` after attendance sync.

Rate limiting across replicas: set `REDIS_URL` (falls back to in-memory per instance).

## Phase 7 — Read replica

Set `DATABASE_READ_URL` to a PostgreSQL read replica. Report and analytics handlers use `pool.get_read()`.

Materialized view `mv_org_attendance_monthly` is created on PostgreSQL bootstrap (refreshed on startup).

## Phase 8 — Operations

```bash
# Backups
docker compose -f deploy/docker-compose.production.yml exec postgres \
  pg_dump -U hrm hrm > hrm-backup.sql

# Post-migration analyze
python scripts/migrate-sqlite-to-postgres.py --sqlite database/database.sqlite --pg-url $DATABASE_URL
# ANALYZE runs at end of migration script on PostgreSQL
```

CI: `scripts/run-postgres-staging-tests.ps1` for PostgreSQL regression.

## Recommended rollout

1. Deploy indexes (automatic) → run full test suite
2. Tune `DB_POOL_MAX_SIZE` under load
3. Enable `REDIS_URL` when scaling API horizontally
4. Enable `ENABLE_PG_RLS` before multi-team production access
5. Plan partitioning when `biometric_punches` exceeds ~10M rows

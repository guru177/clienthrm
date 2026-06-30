-- PostgreSQL init for Raintech HRM (multi-tenant production)
-- Full schema is created by scripts/migrate-sqlite-to-postgres.py from SQLite.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Optional slow-query visibility (requires shared_preload_libraries on some hosts)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
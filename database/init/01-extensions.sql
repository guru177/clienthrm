-- PostgreSQL init for Raintech HRM (local + production)
-- Full schema: backend postgres_bootstrap or scripts/migrate-sqlite-to-postgres.py

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

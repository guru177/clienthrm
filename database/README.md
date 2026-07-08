# Database (PostgreSQL)

Local development stores PostgreSQL data under this folder.

| Path | Purpose |
|------|---------|
| `pgdata/` | Docker Postgres data directory (gitignored) |
| `init/` | SQL run on first container start |
| `hrm-backup.sql` | Optional manual dumps (gitignored) |

**Connection (local):** `postgres://hrm:hrm@127.0.0.1:5433/hrm`

```powershell
docker compose up -d postgres
```

Set `DATABASE_URL` in `backend/.env` (see `backend/.env.example`).

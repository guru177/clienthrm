# Local database snapshot

PostgreSQL dump of the current local dev database (`hrm` on port **5433**).

| File | Description |
|------|-------------|
| `hrm.sql` | Full schema + data (`pg_dump`, plain SQL) |

**Source connection:** `postgres://hrm:hrm@127.0.0.1:5433/hrm`

## Restore

Start Postgres (from repo root):

```powershell
docker compose up -d postgres
```

Restore into a fresh or empty `hrm` database:

```powershell
# Option A — via Docker
Get-Content db\hrm.sql | docker exec -i hrm-postgres-1 psql -U hrm -d hrm

# Option B — local psql client
psql "postgres://hrm:hrm@127.0.0.1:5433/hrm" -f db/hrm.sql
```

To replace an existing database entirely:

```powershell
docker exec hrm-postgres-1 psql -U hrm -d postgres -c "DROP DATABASE IF EXISTS hrm;"
docker exec hrm-postgres-1 psql -U hrm -d postgres -c "CREATE DATABASE hrm OWNER hrm;"
Get-Content db\hrm.sql | docker exec -i hrm-postgres-1 psql -U hrm -d hrm
```

## Refresh dump

```powershell
docker exec hrm-postgres-1 pg_dump -U hrm -d hrm --no-owner --no-acl -f /tmp/hrm.sql
docker cp hrm-postgres-1:/tmp/hrm.sql db/hrm.sql
```

> **Note:** `hrm.sql` contains real data (users, salaries, etc.). Do not commit it to a public repo.

# Start local PostgreSQL (data: database/pgdata/).
# Requires Docker Desktop running.

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$PgUrl = "postgres://hrm:hrm@127.0.0.1:5433/hrm"
$PgData = Join-Path $PWD "database\pgdata"

New-Item -ItemType Directory -Force -Path $PgData | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $PWD "database\init") | Out-Null

Write-Host "Starting PostgreSQL (docker compose)..." -ForegroundColor Cyan
docker compose up -d postgres

Write-Host "Waiting for PostgreSQL to be ready..." -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    docker compose exec -T postgres pg_isready -U hrm -d hrm 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    Write-Host "ERROR: PostgreSQL did not become ready in time." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Local PostgreSQL is ready." -ForegroundColor Green
Write-Host "Data path: database/pgdata/"
Write-Host "DATABASE_URL=$PgUrl"
Write-Host "Restart the backend (cargo run) if it is already running."

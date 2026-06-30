# Run integration suites against PostgreSQL (staging).
#
# Prerequisites:
#   1. PostgreSQL running and DATABASE_URL set (or pass -PgUrl)
#   2. Backend stopped before migration (or use fresh DB)
#
# Usage:
#   $env:DATABASE_URL = "postgres://hrm:secret@localhost:5432/hrm"
#   powershell -NoProfile -File scripts/run-postgres-staging-tests.ps1
#
# Optional:
#   -SkipMigrate   skip sqlite-to-postgres migration
#   -SkipBackend   do not start backend (assume already running with DATABASE_URL)

param(
    [string]$PgUrl = $env:DATABASE_URL,
    [switch]$SkipMigrate,
    [switch]$SkipBackend
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not $PgUrl) {
    Write-Host "ERROR: Set DATABASE_URL or pass -PgUrl postgres://..." -ForegroundColor Red
    exit 1
}

Write-Host "PostgreSQL staging test run"
Write-Host "DATABASE_URL: $($PgUrl -replace '://[^@]+@', '://***@')"

if (-not $SkipMigrate) {
    Write-Host "Migrating SQLite -> PostgreSQL..."
    python scripts/migrate-sqlite-to-postgres.py --sqlite database/database.sqlite --pg-url $PgUrl
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Migration failed" -ForegroundColor Red
        exit 1
    }
}

$env:DATABASE_URL = $PgUrl

$backendJob = $null
if (-not $SkipBackend) {
    Write-Host "Starting backend with DATABASE_URL..."
    Push-Location backend
    $backendJob = Start-Job -ScriptBlock {
        param($dir, $url)
        Set-Location $dir
        $env:DATABASE_URL = $url
        & cargo run 2>&1
    } -ArgumentList (Join-Path $Root "backend"), $PgUrl
    Pop-Location
    $deadline = (Get-Date).AddSeconds(90)
    $up = $false
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { $up = $true; break }
        } catch {}
        Start-Sleep -Seconds 2
    }
    if (-not $up) {
        Write-Host "Backend failed to start on :3001" -ForegroundColor Red
        if ($backendJob) { Stop-Job $backendJob; Remove-Job $backendJob -Force }
        exit 1
    }
}

$ok = $true
try {
    python scripts/test-database-health.py
    if ($LASTEXITCODE -ne 0) { $ok = $false }

    python scripts/test-saas-suite.py
    if ($LASTEXITCODE -ne 0) { $ok = $false }

    python scripts/test-payroll-attendance-suite.py
    if ($LASTEXITCODE -ne 0) { $ok = $false }

    python scripts/test-payroll-compliance-suite.py
    if ($LASTEXITCODE -ne 0) { $ok = $false }
} finally {
    if ($backendJob) {
        Stop-Job $backendJob -ErrorAction SilentlyContinue
        Remove-Job $backendJob -Force -ErrorAction SilentlyContinue
    }
}

if ($ok) {
    Write-Host "PostgreSQL staging suites passed." -ForegroundColor Green
    exit 0
}
Write-Host "PostgreSQL staging suites failed." -ForegroundColor Red
exit 1

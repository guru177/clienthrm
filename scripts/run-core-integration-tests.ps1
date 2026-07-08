# Run shift + attendance + salary + payroll + workflow integration tests.
# Prerequisites: backend on :3001, PostgreSQL (docker compose up -d)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Api = if ($env:HRM_API) { $env:HRM_API } else { "http://127.0.0.1:3001" }
$env:HRM_API = $Api
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -TimeoutSec 5
    if ($health.database.backend -ne "postgres") {
        Write-Host "ERROR: Backend must use PostgreSQL. Run: docker compose up -d; restart backend" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "ERROR: Backend not reachable on :3001" -ForegroundColor Red
    exit 1
}
try {
    $r = Invoke-WebRequest -Uri "$Api/api/health" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -lt 200 -or $r.StatusCode -ge 500) { throw "bad status" }
} catch {
    Write-Host "ERROR: Backend not reachable at $Api" -ForegroundColor Red
    exit 1
}

$Suites = @(
    @{ Name = "HRM core integration (30 cases incl. leave)"; Script = "python scripts/test-hrm-core-integration-suite.py" },
    @{ Name = "Shift + payroll (16 cases)"; Script = "python scripts/test-shift-payroll-suite.py" },
    @{ Name = "Payroll + attendance (18 cases)"; Script = "python scripts/test-payroll-attendance-suite.py" },
    @{ Name = "Workflow engine (13 cases)"; Script = "python scripts/test-workflow-suite.py" },
    @{ Name = "Payroll compliance"; Script = "python scripts/test-payroll-compliance-suite.py" }
)

$failed = 0
Write-Host "HRM CORE MODULE INTEGRATION RUN"
Write-Host "Root: $Root"
Write-Host ""

foreach ($s in $Suites) {
    Write-Host ("=" * 60)
    Write-Host $s.Name -ForegroundColor Cyan
    Write-Host ("=" * 60)
    Invoke-Expression $s.Script
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[FAIL] $($s.Name)" -ForegroundColor Red
        $failed++
    } else {
        Write-Host "[PASS] $($s.Name)" -ForegroundColor Green
    }
    Write-Host ""
}

Write-Host ("=" * 60)
if ($failed -eq 0) {
    Write-Host "All core integration suites passed." -ForegroundColor Green
    exit 0
}
Write-Host "$failed suite(s) failed." -ForegroundColor Red
exit 1

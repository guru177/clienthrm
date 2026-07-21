# Complete HRM test run: tenant app, platform, backend, database, biometric, payroll, shifts.
#
# Prerequisites:
#   Backend   http://localhost:3001  (cd backend; cargo run)
#   Tenant UI http://localhost:5174  (cd frontend; npm run dev)
#   Platform  http://localhost:5175  (cd platform; npm run dev)  [optional — skipped if down]
#   PostgreSQL (docker compose up -d)
#
# Usage:
#   powershell -NoProfile -File scripts/run-complete-all-tests.ps1
#   powershell -NoProfile -File scripts/run-complete-all-tests.ps1 -SkipPrune

param(
    [switch]$SkipFrontend,
    [switch]$SkipPlatform,
    [switch]$SkipRust,
    [switch]$SkipBrowserNav,
    [switch]$SkipPrune
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Api = if ($env:HRM_API) { $env:HRM_API } else { "http://127.0.0.1:3001" }
$env:HRM_API = $Api
$env:HRM_EMAIL = if ($env:HRM_EMAIL) { $env:HRM_EMAIL } else { "info@retaildaddy.in" }
$env:HRM_PASSWORD = if ($env:HRM_PASSWORD) { $env:HRM_PASSWORD } else { "Guru!1234" }
$env:HRM_ORG_SLUG = if ($env:HRM_ORG_SLUG) { $env:HRM_ORG_SLUG } else { "mashuptech" }
$env:E2E_EMAIL = $env:HRM_EMAIL
$env:E2E_PASSWORD = $env:HRM_PASSWORD
$env:E2E_ORG_SLUG = $env:HRM_ORG_SLUG
$env:PLAYWRIGHT_SKIP_WEBSERVER = "1"
$env:PLAYWRIGHT_SKIP_API = "1"
$env:PLATFORM_ADMIN_PASSWORD = if ($env:PLATFORM_ADMIN_PASSWORD) { $env:PLATFORM_ADMIN_PASSWORD } else { "LocalTest123!" }
$Fe = "http://localhost:5174"
$Platform = "http://localhost:5175"
$Results = @()

function Add-Result {
    param([string]$Suite, [string]$Status, [string]$Detail = "")
    $script:Results += [pscustomobject]@{ Suite = $Suite; Status = $Status; Detail = $Detail }
}

function Test-Url {
    param([string]$Url, [int]$TimeoutSec = 5)
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        return $r.StatusCode -ge 200 -and $r.StatusCode -lt 500
    } catch { return $false }
}

function Run-Step {
    param([string]$Name, [scriptblock]$Action)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host $Name -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
    try {
        & $Action | Out-Null
        $exit = if ($null -ne $global:LASTEXITCODE) { $global:LASTEXITCODE } else { $LASTEXITCODE }
        if ($exit -eq 0) {
            Add-Result $Name "PASS" ""
            Write-Host "[PASS] $Name" -ForegroundColor Green
            return $true
        }
        Add-Result $Name "FAIL" "exit=$exit"
        Write-Host "[FAIL] $Name (exit $exit)" -ForegroundColor Red
        return $false
    } catch {
        Add-Result $Name "FAIL" $_.Exception.Message
        Write-Host "[FAIL] $Name - $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Run-Step-Skip {
    param([string]$Name, [string]$Reason)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host $Name -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Add-Result $Name "SKIP" $Reason
    Write-Host "[SKIP] $Name - $Reason" -ForegroundColor Yellow
    return $true
}

Write-Host "HRM - COMPLETE ALL-IN-ONE TEST RUN"
Write-Host "Root: $Root"
Write-Host "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

if (-not (Test-Url "$Api/api/health")) {
    Write-Host "ERROR: Backend not reachable at $Api" -ForegroundColor Red
    exit 1
}
try {
    $health = Invoke-RestMethod -Uri "$Api/api/health" -TimeoutSec 5
    if ($health.database.backend -ne "postgres") {
        Write-Host "ERROR: Backend must use PostgreSQL. Run: docker compose up -d; restart backend" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "ERROR: Backend health check failed at $Api" -ForegroundColor Red
    exit 1
}

$platformUp = Test-Url $Platform
if (-not $SkipFrontend -and -not (Test-Url $Fe)) {
    Write-Host "WARN: Tenant frontend not on $Fe — skipping UI tests" -ForegroundColor Yellow
    $SkipFrontend = $true
}
if (-not $SkipPlatform -and -not $platformUp) {
    Write-Host "WARN: Platform UI not on $Platform — skipping platform UI check" -ForegroundColor Yellow
    $SkipPlatform = $true
}

$ok = $true

$ok = (Run-Step "Pre-production connectivity (health/mail/AWS/tenant)" {
    python scripts/test-preproduction-connectivity.py
}) -and $ok

# Database health first (integrity, indexes, WAL, concurrency)
$ok = (Run-Step "Database health & optimization (19 checks)" {
    python scripts/test-database-health.py
}) -and $ok

# Biometric + SaaS (platform auth, tenant isolation)
$ok = (Run-Step "Biometric suite (22 cases)" {
    python scripts/test-biometric-suite.py
}) -and $ok

$ok = (Run-Step "SaaS suite - platform + tenant isolation (30 cases)" {
    python scripts/test-saas-suite.py
}) -and $ok

$ok = (Run-Step "Platform API extended (34 endpoints)" {
    python scripts/test-platform-api-suite.py
}) -and $ok

# Domain integration
$ok = (Run-Step "Shift + payroll integration (13 cases)" {
    python scripts/test-shift-payroll-suite.py
}) -and $ok

$ok = (Run-Step "Workflow engine suite" {
    python scripts/test-workflow-suite.py
}) -and $ok

$ok = (Run-Step "HRM core integration (shift/attendance/salary/leave/workflow)" {
    python scripts/test-hrm-core-integration-suite.py
}) -and $ok

$ok = (Run-Step "Payroll compliance suite" {
    python scripts/test-payroll-compliance-suite.py
}) -and $ok

$ok = (Run-Step "All tenant modules API catalog" {
    python scripts/test-all-24-modules.py
}) -and $ok

if (-not $SkipRust) {
    $ok = (Run-Step "Rust unit tests (cargo test)" {
        Push-Location backend
        try { cargo test -- --test-threads=1 } finally { Pop-Location }
    }) -and $ok

    $ok = (Run-Step "Frontend unit tests (vitest)" {
        Push-Location frontend
        try {
            Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
            Remove-Item Env:VITE_PLATFORM_APP_URL -ErrorAction SilentlyContinue
            npm run test
        } finally { Pop-Location }
    }) -and $ok

    $pwE2eMain = Join-Path $Root "frontend\node_modules\playwright\index.mjs"
    if (Test-Path $pwE2eMain) {
        $ok = (Run-Step "Playwright E2E (auth + tenant smoke)" {
            Push-Location frontend
            try {
                Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
                npx playwright test
            } finally { Pop-Location }
        }) -and $ok
    } else {
        Run-Step-Skip "Playwright E2E (auth + tenant smoke)" "playwright not installed"
    }
}

if (-not $SkipFrontend) {
    $ok = (Run-Step "Tenant API read flow (50+ endpoints)" {
        & "$Root/scripts/flow-test.ps1"
    }) -and $ok

    $ok = (Run-Step "Tenant API write flow" {
        & "$Root/scripts/api-input-flow-test.ps1"
    }) -and $ok

    $ok = (Run-Step "Attendance flow" {
        & "$Root/scripts/attendance-flow-test.ps1"
    }) -and $ok

    # After attendance write tests — isolated payroll+attendance integration
    $ok = (Run-Step "Payroll + attendance integration (18 cases)" {
        python scripts/test-payroll-attendance-suite.py
    }) -and $ok

    $ok = (Run-Step "Tenant frontend modules (31 pages)" {
        node scripts/frontend-module-check.mjs
    }) -and $ok

    Start-Sleep -Seconds 2
    $ok = (Run-Step "All tenant modules UI catalog" {
        node scripts/test-all-24-modules-ui.mjs
    }) -and $ok

    $pwInput = Join-Path $Root "frontend\node_modules\playwright\index.mjs"
    if (Test-Path $pwInput) {
        $inputOk = Run-Step "Tenant UI input flow forms" {
            node frontend/scripts/ui-input-flow-check.mjs
        }
        if (-not $inputOk -and $LASTEXITCODE -eq 2) {
            $script:Results = @($script:Results | Where-Object { $_.Suite -ne "Tenant UI input flow forms" })
            Run-Step-Skip "Tenant UI input flow forms" "playwright/chromium missing"
        } else {
            $ok = $inputOk -and $ok
        }
    } else {
        Run-Step-Skip "Tenant UI input flow forms" "playwright not installed"
    }

    $pwE2e = Join-Path $Root "frontend\node_modules\playwright\index.mjs"
    if (Test-Path $pwE2e) {
        $e2eOk = Run-Step "Targeted E2E flows (auth/payroll/workflow)" {
            node scripts/e2e-targeted-flows.mjs
        }
        if (-not $e2eOk -and $LASTEXITCODE -eq 2) {
            $script:Results = @($script:Results | Where-Object { $_.Suite -ne "Targeted E2E flows (auth/payroll/workflow)" })
            Run-Step-Skip "Targeted E2E flows (auth/payroll/workflow)" "playwright/chromium missing"
        } else {
            $ok = $e2eOk -and $ok
        }
    } else {
        Run-Step-Skip "Targeted E2E flows (auth/payroll/workflow)" "playwright not installed"
    }

    if (-not $SkipBrowserNav) {
        $pw = Join-Path $Root "frontend\node_modules\playwright\index.mjs"
        if (Test-Path $pw) {
            Start-Sleep -Seconds 2
            $navOk = Run-Step "Tenant UI browser nav" { node scripts/ui-nav-check.mjs }
            if (-not $navOk -and $LASTEXITCODE -eq 2) {
                $script:Results = @($script:Results | Where-Object { $_.Suite -ne "Tenant UI browser nav" })
                Run-Step-Skip "Tenant UI browser nav" "chromium missing"
            } else {
                $ok = $navOk -and $ok
            }
        } else {
            Run-Step-Skip "Tenant UI browser nav" "playwright not installed"
        }
    }
}

if (-not $SkipPlatform) {
    $ok = (Run-Step "Platform frontend modules (15 pages)" {
        node scripts/platform-module-check.mjs
    }) -and $ok
} else {
    Run-Step-Skip "Platform frontend modules (15 pages)" "platform not running on :5175"
}

# Security probes last — avoids rate-limiting admin login for earlier API/UI suites
$ok = (Run-Step "Auth & security suite" {
    python scripts/test-auth-security-suite.py
}) -and $ok

$ok = (Run-Step "Validation suite (null/empty fields)" {
    python scripts/test-validation-suite.py
}) -and $ok

$ok = (Run-Step "Signup & OTP flow suite" {
    python scripts/test-signup-flow-suite.py
}) -and $ok

# Post-marathon cleanup — workflow/core tests create thousands of QA tasks
if (-not $SkipPrune) {
    Run-Step "Prune QA workflow tasks" {
        python scripts/prune-qa-workflow-tasks.py
    } | Out-Null
} else {
    Run-Step-Skip "Prune QA workflow tasks" "-SkipPrune"
}

Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "COMPLETE TEST SUMMARY" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan
$Results | Format-Table -AutoSize

$passed = (@($Results | Where-Object { $_.Status -eq "PASS" })).Count
$failed = (@($Results | Where-Object { $_.Status -eq "FAIL" })).Count
$skipped = (@($Results | Where-Object { $_.Status -eq "SKIP" })).Count
Write-Host "Suites: $passed passed, $failed failed, $skipped skipped"

if ($ok) {
    Write-Host "All suites passed." -ForegroundColor Green
    exit 0
}
Write-Host "One or more suites failed." -ForegroundColor Red
exit 1

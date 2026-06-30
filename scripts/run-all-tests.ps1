# Run all HRM automated test suites (integration + API + frontend + Rust unit tests).
# Prerequisites: backend on :3001, frontend on :5174 (Vite proxy), database/database.sqlite
#
# Usage:
#   powershell -NoProfile -File scripts/run-all-tests.ps1
#   powershell -NoProfile -File scripts/run-all-tests.ps1 -SkipFrontend
#   powershell -NoProfile -File scripts/run-all-tests.ps1 -SkipRust
#   powershell -NoProfile -File scripts/run-all-tests.ps1 -IncludeBrowserNav

param(
    [switch]$SkipFrontend,
    [switch]$SkipRust,
    [switch]$SkipSaas,
    [switch]$SkipBrowserNav,
    [switch]$IncludeBrowserNav
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Api = "http://localhost:3001"
$Fe = "http://localhost:5174"
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

function Test-PlaywrightReady {
    $pkg = Join-Path $Root "frontend\node_modules\playwright\index.mjs"
    return (Test-Path $pkg)
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

function Run-Step {
    param(
        [string]$Name,
        [scriptblock]$Action
    )
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host $Name -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
    try {
        & $Action | Out-Null
        if ($null -ne $global:LASTEXITCODE) {
            $exit = $global:LASTEXITCODE
        } else {
            $exit = $LASTEXITCODE
        }
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

Write-Host "HRM - full test run"
Write-Host "Root: $Root"
Write-Host "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

if (-not (Test-Url "$Api/api/health")) {
    Write-Host "ERROR: Backend not reachable at $Api - start with: cd backend; cargo run" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path "database/database.sqlite")) {
    Write-Host "ERROR: database/database.sqlite not found" -ForegroundColor Red
    exit 1
}
if (-not $SkipFrontend -and -not (Test-Url $Fe)) {
    Write-Host "WARN: Frontend not reachable at $Fe - skipping Vite-proxy tests (use -SkipFrontend to silence)" -ForegroundColor Yellow
    $SkipFrontend = $true
}

$ok = $true

# Biometric first - avoids SaaS punch polluting open-session checks on other dates
$ok = (Run-Step "Biometric suite (22 cases)" {
    python scripts/test-biometric-suite.py
}) -and $ok

if (-not $SkipSaas) {
    $ok = (Run-Step "SaaS suite (30 cases)" {
        python scripts/test-saas-suite.py
    }) -and $ok
}

if (-not $SkipRust) {
    $ok = (Run-Step "Rust unit tests (cargo test)" {
        Push-Location backend
        try { cargo test } finally { Pop-Location }
    }) -and $ok
}

if (-not $SkipFrontend) {
    $ok = (Run-Step "API read flow (50 endpoints)" {
        & "$Root/scripts/flow-test.ps1"
    }) -and $ok

    $ok = (Run-Step "API write flow" {
        & "$Root/scripts/api-input-flow-test.ps1"
    }) -and $ok

    $ok = (Run-Step "Attendance flow" {
        & "$Root/scripts/attendance-flow-test.ps1"
    }) -and $ok

    $ok = (Run-Step "Frontend module check (31 pages)" {
        node scripts/frontend-module-check.mjs
    }) -and $ok

    $runBrowserNav = $IncludeBrowserNav -or (-not $SkipBrowserNav -and (Test-PlaywrightReady))
    if ($runBrowserNav) {
        if (-not (Test-PlaywrightReady)) {
            if ($IncludeBrowserNav) {
                Add-Result "UI browser nav check" "FAIL" "playwright not installed"
                Write-Host "[FAIL] UI browser nav check - run: cd frontend; npm install; npx playwright install chromium" -ForegroundColor Red
                $ok = $false
            } else {
                Run-Step-Skip "UI browser nav check" "playwright not in frontend/node_modules"
            }
        } else {
            $navOk = Run-Step "UI browser nav check" {
                node scripts/ui-nav-check.mjs
            }
            if (-not $navOk -and $LASTEXITCODE -eq 2) {
                $script:Results = @($script:Results | Where-Object { $_.Suite -ne "UI browser nav check" })
                Run-Step-Skip "UI browser nav check" "chromium browser missing - run: cd frontend; npx playwright install chromium"
            } else {
                $ok = $navOk -and $ok
            }
        }
    } elseif ($SkipBrowserNav) {
        Run-Step-Skip "UI browser nav check" "-SkipBrowserNav"
    }
}

Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "SUMMARY" -ForegroundColor Cyan
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

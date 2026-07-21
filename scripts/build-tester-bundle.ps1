# Package desktop installer + backend exe + notes for pre-production testers.
#
# Usage:
#   .\scripts\build-tester-bundle.ps1 -TunnelUrl https://xxxx.trycloudflare.com -Target api

param(
    [Parameter(Mandatory = $true)]
    [string]$TunnelUrl,
    [ValidateSet('api', 'vite')]
    [string]$Target = 'api'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$TunnelUrl = $TunnelUrl.Trim().TrimEnd('/')
$Out = Join-Path $Root 'dist\pre-production-testers'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmm'

New-Item -ItemType Directory -Force -Path $Out | Out-Null

$setup = Get-ChildItem (Join-Path $Root 'frontend\release\HR-Daddy-Setup-*.exe') -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) {
    throw 'Run scripts\electron-build-cloudflare.ps1 first (no HR-Daddy-Setup-*.exe in frontend\release).'
}

$backend = Join-Path $Root 'backend\target\release\hrm-backend.exe'
if (-not (Test-Path $backend)) {
    Write-Host 'Building release backend...' -ForegroundColor Yellow
    Push-Location (Join-Path $Root 'backend')
    try { cargo build --release } finally { Pop-Location }
}

$label = if ($Target -eq 'api') { 'CLOUDFLARE-API' } else { 'CLOUDFLARE-WEB' }
$destSetup = Join-Path $Out "HR-Daddy-Setup-$label-$Stamp.exe"
Copy-Item $setup.FullName $destSetup -Force
Copy-Item $backend (Join-Path $Out 'hrm-backend.exe') -Force

$hostSteps = if ($Target -eq 'api') {
@"
  3. .\scripts\start-cloudflare-api-tunnel.ps1
     → must match: $TunnelUrl
  (No Vite required for desktop testers.)
"@
} else {
@"
  3. cd frontend && npm run dev:tunnel
  4. .\scripts\start-cloudflare-pwa-tunnel.ps1
     → must match: $TunnelUrl
"@
}

$readme = @"
Raintech HRM — pre-production tester package ($Stamp)
Tunnel mode: $Target
=====================================================

DESKTOP APP (Windows)
  Install: $(Split-Path $destSetup -Leaf)
  API baked in: $TunnelUrl

HOST (your PC — keep running while testers work)
  1. docker compose up -d
  2. hrm-backend.exe on port 3001
$hostSteps

  Quick tunnel URLs change when cloudflared restarts — rebuild installer if URL changes.

WEB / phone: see docs\CLOUDFLARE-TUNNEL-TESTING.md

Built: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
"@
Set-Content -Path (Join-Path $Out 'TESTER-README.txt') -Value $readme -Encoding UTF8

Write-Host "Tester bundle:" -ForegroundColor Green
Write-Host "  $Out"
Get-ChildItem $Out | Format-Table Name, Length, LastWriteTime

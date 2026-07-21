# Build Windows HR Daddy installer pointed at a Cloudflare quick-tunnel URL.
#
# -Target api   (recommended for .exe) Tunnel to backend :3001 — .\scripts\start-cloudflare-api-tunnel.ps1
# -Target vite  (browser/PWA only)     Tunnel to Vite :5174   — npm run dev:tunnel + start-cloudflare-pwa-tunnel.ps1
#
# Usage:
#   .\scripts\electron-build-cloudflare.ps1 -TunnelUrl https://xxxx.trycloudflare.com -Target api

param(
    [string]$TunnelUrl = $env:TUNNEL_URL,
    [ValidateSet('api', 'vite')]
    [string]$Target = 'api'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'

if (-not $TunnelUrl) {
    $urlFile = Join-Path $Root 'dist\cloudflare-api-url.txt'
    if ($Target -eq 'api' -and (Test-Path $urlFile)) {
        $TunnelUrl = (Get-Content $urlFile -Raw).Trim()
        Write-Host "Using URL from $urlFile" -ForegroundColor DarkGray
    }
}
if (-not $TunnelUrl) {
    $TunnelUrl = Read-Host 'Paste Cloudflare HTTPS URL (https://....trycloudflare.com)'
}

$TunnelUrl = $TunnelUrl.Trim().TrimEnd('/')
if ($TunnelUrl -notmatch '^https://') {
    throw 'TunnelUrl must be https://...'
}

Write-Host "Building Electron installer for tunnel ($Target): $TunnelUrl" -ForegroundColor Cyan
Push-Location $Frontend
try {
    node scripts/clean-electron-packaging.mjs
    node scripts/ensure-tunnel-api.mjs $TunnelUrl
    node scripts/generate-installer-assets.mjs
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "vite build failed ($LASTEXITCODE)" }
    npx electron-builder
    if ($LASTEXITCODE -ne 0) { throw "electron-builder failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
}

$setup = Get-ChildItem -Path (Join-Path $Frontend 'release') -Filter 'HR-Daddy-Setup-*.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

Write-Host ''
if ($setup) {
    Write-Host "Installer ready:" -ForegroundColor Green
    Write-Host "  $($setup.FullName)"
    Write-Host ''
    if ($Target -eq 'api') {
        Write-Host "Keep running while testers use the .exe:" -ForegroundColor DarkGray
        Write-Host "  1. docker compose up -d"
        Write-Host "  2. hrm-backend.exe on :3001"
        Write-Host "  3. .\scripts\start-cloudflare-api-tunnel.ps1  (same URL: $TunnelUrl)"
    } else {
        Write-Host "Keep running (web tunnel):" -ForegroundColor DarkGray
        Write-Host "  1. backend :3001"
        Write-Host "  2. cd frontend; npm run dev:tunnel"
        Write-Host "  3. .\scripts\start-cloudflare-pwa-tunnel.ps1  (URL: $TunnelUrl)"
    }
} else {
    Write-Host 'Build finished; check frontend\release\' -ForegroundColor Yellow
}

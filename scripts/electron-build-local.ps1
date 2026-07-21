# Windows desktop installer for testers on the SAME PC or LAN (API on :3001, no Cloudflare).
#
# Usage:
#   .\scripts\electron-build-local.ps1
#   .\scripts\electron-build-local.ps1 -ApiBase http://192.168.1.50:3001

param(
    [string]$ApiBase = 'http://127.0.0.1:3001'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'
$ApiBase = $ApiBase.Trim().TrimEnd('/')

Write-Host "Building local desktop installer (API $ApiBase)..." -ForegroundColor Cyan
Push-Location $Frontend
try {
    node scripts/clean-electron-packaging.mjs
    $payload = @{ apiBase = $ApiBase; tenantAppUrl = $ApiBase; platformAppUrl = $ApiBase } | ConvertTo-Json
    Set-Content -Path (Join-Path $Frontend 'electron\production-api.json') -Value $payload -Encoding UTF8
    Set-Content -Path (Join-Path $Frontend '.env.production') -Value "VITE_API_URL=$ApiBase/api`n" -Encoding UTF8
    node scripts/generate-installer-assets.mjs
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "vite build failed" }
    npx electron-builder
    if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }
}
finally {
    Pop-Location
}

$setup = Get-ChildItem (Join-Path $Frontend 'release\HR-Daddy-Setup-*.exe') | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host "Installer: $($setup.FullName)" -ForegroundColor Green
Write-Host "Requires hrm-backend.exe listening on $ApiBase"

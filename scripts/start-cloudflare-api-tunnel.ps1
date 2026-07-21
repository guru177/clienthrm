# HTTPS quick tunnel to the Rust API (:3001) - use for Windows desktop installer + remote testers.
# CORS from Electron (hrm://) is handled by the backend directly (no Vite in the path).
#
# Prerequisites: backend listening on http://127.0.0.1:3001
#
# Usage:
#   .\scripts\start-cloudflare-api-tunnel.ps1
#   .\scripts\start-cloudflare-api-tunnel.ps1 -WriteUrlFile

param(
    [int]$Port = 3001,
    [switch]$WriteUrlFile
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'cloudflare-tunnel-lib.ps1')
$Root = Split-Path -Parent $PSScriptRoot
$cf = Get-CloudflaredPath

$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
    Write-Host "Nothing is listening on port $Port." -ForegroundColor Red
    Write-Host "Start the API first:  backend\target\release\hrm-backend.exe"
    exit 1
}

$urlFile = Join-Path $Root 'dist\cloudflare-api-url.txt'
if ($WriteUrlFile) {
    New-Item -ItemType Directory -Force -Path (Split-Path $urlFile) | Out-Null
    $log = Join-Path $Root 'cloudflare-api-tunnel.log'
    Remove-Item $log -ErrorAction SilentlyContinue
    $proc = Start-Process -FilePath $cf -ArgumentList @('tunnel', '--url', ('http://127.0.0.1:' + $Port)) `
        -RedirectStandardError $log -PassThru -WindowStyle Hidden
    try {
        $url = Wait-CloudflareTunnelUrl -LogPath $log
        Set-Content -Path $urlFile -Value $url -Encoding UTF8
        Write-Host "API tunnel URL (saved):" -ForegroundColor Green
        Write-Host "  $url"
        Write-Host "  $urlFile"
        Write-Host ""
        Write-Host "Build desktop installer:" -ForegroundColor Cyan
        Write-Host "  .\scripts\electron-build-cloudflare.ps1 -TunnelUrl $url -Target api"
        Write-Host ""
        Write-Host "Tunnel PID $($proc.Id) - leave running. Stop: Stop-Process -Id $($proc.Id)"
    } catch {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        throw
    }
    return
}

Write-Host ""
Write-Host "Cloudflare quick tunnel -> http://127.0.0.1:$Port (HRM API)" -ForegroundColor Cyan
Write-Host "Use this URL in electron-build-cloudflare.ps1 -Target api" -ForegroundColor DarkGray
Write-Host "Leave this window open while testers use the desktop app or API." -ForegroundColor DarkGray
Write-Host ""

& $cf tunnel --url ('http://127.0.0.1:' + $Port)

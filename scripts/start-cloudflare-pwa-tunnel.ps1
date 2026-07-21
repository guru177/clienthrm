# Expose the tenant Vite app (HTTPS) via Cloudflare quick tunnel for mobile PWA testing.
# Prerequisites:
#   1. Backend running on http://127.0.0.1:3001
#   2. Frontend:  $env:VITE_DEV_TUNNEL=1; npm run dev   (in frontend/)
#   3. cloudflared installed (winget install Cloudflare.cloudflared)
#
# Usage (from repo root):
#   .\scripts\start-cloudflare-pwa-tunnel.ps1
#   .\scripts\start-cloudflare-pwa-tunnel.ps1 -Port 5174

param(
    [int]$Port = 5174
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'cloudflare-tunnel-lib.ps1')
$cf = Get-CloudflaredPath

$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
    Write-Host "Nothing is listening on port $Port." -ForegroundColor Yellow
    Write-Host "Start the frontend first in another terminal:"
    Write-Host "  cd frontend"
    Write-Host "  npm run dev:tunnel"
    Write-Host ""
    Write-Host "Also ensure the API is up: http://127.0.0.1:3001"
    exit 1
}

Write-Host ""
Write-Host "Starting Cloudflare quick tunnel -> http://127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host "API calls stay same-origin (/api) and are proxied to :3001 by Vite." -ForegroundColor DarkGray
Write-Host "Copy the https://*.trycloudflare.com URL below onto your phone." -ForegroundColor DarkGray
Write-Host "Leave this window open while testing." -ForegroundColor DarkGray
Write-Host ""

# Quick tunnel (no Cloudflare account required)
& $cf tunnel --url ('http://127.0.0.1:' + $Port)

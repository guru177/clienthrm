# Cloudflare testing — start tunnels and (optionally) build desktop installer.
#
# WEB / phone PWA (one tunnel, Vite proxies /api):
#   Terminal 1: cd frontend; npm run dev:tunnel
#   Terminal 2: .\scripts\start-cloudflare-pwa-tunnel.ps1
#   Open the printed https://….trycloudflare.com URL in browser or build TWA APK.
#
# DESKTOP exe for remote testers (tunnel straight to API — recommended):
#   Terminal 1: hrm-backend on :3001
#   Terminal 2: .\scripts\start-cloudflare-api-tunnel.ps1
#   Copy URL, then:
#   .\scripts\electron-build-cloudflare.ps1 -TunnelUrl https://….trycloudflare.com -Target api
#   .\scripts\build-tester-bundle.ps1 -TunnelUrl https://….trycloudflare.com -Target api
#
# One-shot capture API URL to dist\cloudflare-api-url.txt (tunnel runs in background):
#   .\scripts\start-cloudflare-api-tunnel.ps1 -WriteUrlFile

param(
    [ValidateSet('api', 'web', 'help')]
    [string]$Mode = 'help'
)

$ErrorActionPreference = 'Stop'

switch ($Mode) {
    'api' {
        & (Join-Path $PSScriptRoot 'start-cloudflare-api-tunnel.ps1')
    }
    'web' {
        & (Join-Path $PSScriptRoot 'start-cloudflare-pwa-tunnel.ps1')
    }
    default {
        Get-Content (Join-Path $PSScriptRoot '..\docs\CLOUDFLARE-TUNNEL-TESTING.md') -ErrorAction SilentlyContinue
        if (-not $?) {
            Write-Host @"

Cloudflare quick tunnels (trycloudflare.com)

  WEB / PWA     frontend: npm run dev:tunnel  +  .\scripts\start-cloudflare-pwa-tunnel.ps1
  DESKTOP .exe  backend on :3001  +  .\scripts\start-cloudflare-api-tunnel.ps1
                then electron-build-cloudflare.ps1 -Target api

  .\scripts\cloudflare-tunnel.ps1 -Mode api
  .\scripts\cloudflare-tunnel.ps1 -Mode web

"@
        }
    }
}

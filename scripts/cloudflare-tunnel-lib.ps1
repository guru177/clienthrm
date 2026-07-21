# Resolve cloudflared.exe (repo tools/ or PATH).
function Get-CloudflaredPath {
    $root = Split-Path -Parent $PSScriptRoot
    $paths = @(
        (Join-Path $root 'tools\cloudflared.exe')
    )
    $fromCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($fromCmd) { $paths += $fromCmd.Source }
    foreach ($p in $paths) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
    throw "cloudflared not found. Install: winget install Cloudflare.cloudflared  (or place tools\cloudflared.exe)"
}

function Wait-CloudflareTunnelUrl {
    param(
        [string]$LogPath,
        [int]$TimeoutSec = 90
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $LogPath) {
            $m = Select-String -Path $LogPath -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches |
                Select-Object -First 1
            if ($m) { return $m.Matches[0].Value }
        }
        Start-Sleep -Seconds 2
    }
    throw "Timed out waiting for trycloudflare.com URL in $LogPath"
}

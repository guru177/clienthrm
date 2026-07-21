# Thin wrapper — see android-twa\build-cloudflare.ps1
param(
    [Parameter(Mandatory = $true)]
    [string]$TunnelUrl,
    [switch]$SkipBuild
)

$script = Join-Path $PSScriptRoot '..\android-twa\build-cloudflare.ps1'
& $script -TunnelUrl $TunnelUrl -SkipBuild:$SkipBuild

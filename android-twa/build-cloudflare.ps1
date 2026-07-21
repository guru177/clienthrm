# Build a sideloadable TWA APK pointed at the current Cloudflare quick-tunnel URL.
#
# Prerequisites:
#   1. Backend on :3001
#   2. frontend: npm run dev:tunnel
#   3. .\scripts\start-cloudflare-pwa-tunnel.ps1  (copy the printed HTTPS URL)
#   4. JDK (Android Studio JBR is fine) + Bubblewrap Android SDK (see setup-tools.ps1)
#
# Usage (from repo root or android-twa/):
#   .\android-twa\build-cloudflare.ps1 -TunnelUrl https://xxxx.trycloudflare.com

param(
    [Parameter(Mandatory = $true)]
    [string]$TunnelUrl,

    [string]$PackageId = 'com.raintech.hrm',
    [string]$KeystorePassword = 'android',
    [string]$KeyAlias = 'android',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

function Normalize-TunnelUrl([string]$Url) {
    $u = $Url.Trim().TrimEnd('/')
    if ($u -notmatch '^https://') {
        throw "TunnelUrl must be https://... (got: $Url)"
    }
    return $u
}

function Get-KeytoolPath {
    $fromCmd = Get-Command keytool -ErrorAction SilentlyContinue
    $candidates = @(
        (Join-Path $env:JAVA_HOME 'bin\keytool.exe'),
        'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe'
    )
    if ($fromCmd) { $candidates += $fromCmd.Source }
    $hit = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if (-not $hit) {
        throw "keytool not found. Install Android Studio or set JAVA_HOME."
    }
    return $hit
}

function Ensure-NoSpaceJdk {
    # Bubblewrap signs via cmd.exe and breaks on spaces in "Program Files".
    $bwJdk = Join-Path $env:USERPROFILE '.bubblewrap\jdk'
    $jbr = 'C:\Program Files\Android\Android Studio\jbr'
    if (-not (Test-Path (Join-Path $bwJdk 'bin\java.exe'))) {
        if (-not (Test-Path (Join-Path $jbr 'bin\java.exe'))) {
            throw "Android Studio JBR not found at $jbr"
        }
        New-Item -ItemType Directory -Force -Path (Split-Path $bwJdk) | Out-Null
        if (Test-Path $bwJdk) { cmd /c "rmdir `"$bwJdk`"" | Out-Null }
        cmd /c "mklink /J `"$bwJdk`" `"$jbr`"" | Out-Null
    }
    $env:JAVA_HOME = $bwJdk
    $env:Path = "$(Join-Path $bwJdk 'bin');$env:Path"
    return $bwJdk
}

function Ensure-BubblewrapConfig([string]$JdkPath) {
    $bwDir = Join-Path $env:USERPROFILE '.bubblewrap'
    $cfgPath = Join-Path $bwDir 'config.json'
    $sdkPath = Join-Path $bwDir 'android_sdk'
    New-Item -ItemType Directory -Force -Path $bwDir | Out-Null

    if (-not (Test-Path $sdkPath)) {
        Write-Host "Android SDK missing at $sdkPath" -ForegroundColor Yellow
        Write-Host "Run first:  .\android-twa\setup-tools.ps1" -ForegroundColor Yellow
        throw "Bubblewrap Android SDK not installed. Run android-twa\setup-tools.ps1"
    }

    # Bubblewrap validates SDK root must contain bin/ or tools/
    $sdkBin = Join-Path $sdkPath 'bin'
    $cmdlineBin = Join-Path $sdkPath 'cmdline-tools\latest\bin'
    if (-not (Test-Path (Join-Path $sdkBin 'sdkmanager.bat')) -and (Test-Path (Join-Path $cmdlineBin 'sdkmanager.bat'))) {
        if (Test-Path $sdkBin) { cmd /c "rmdir `"$sdkBin`"" | Out-Null }
        cmd /c "mklink /J `"$sdkBin`" `"$cmdlineBin`"" | Out-Null
    }

    $cfg = (@{
        jdkPath        = ($JdkPath -replace '\\', '/')
        androidSdkPath = ((Resolve-Path $sdkPath).Path -replace '\\', '/')
    } | ConvertTo-Json)
    Write-Utf8NoBom -Path $cfgPath -Content $cfg
    Write-Host "Wrote $cfgPath"
}

function Get-CertSha256([string]$KeystorePath, [string]$Alias, [string]$StorePass, [string]$Keytool) {
    $out = & $Keytool -list -v -keystore $KeystorePath -alias $Alias -storepass $StorePass 2>&1 | Out-String
    $m = [regex]::Match($out, 'SHA256:\s*([0-9A-Fa-f:]+)')
    if (-not $m.Success) {
        throw "Could not read SHA256 fingerprint from keystore $KeystorePath"
    }
    return ($m.Groups[1].Value.ToUpperInvariant())
}

function Write-AssetLinks([string]$Sha256, [string]$Pkg) {
    $repoRoot = Split-Path $PSScriptRoot -Parent
    $outDir = Join-Path $repoRoot 'frontend\public\.well-known'
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    $outFile = Join-Path $outDir 'assetlinks.json'
    $json = @"
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "$Pkg",
      "sha256_cert_fingerprints": [
        "$Sha256"
      ]
    }
  }
]
"@
    Write-Utf8NoBom -Path $outFile -Content $json.Trim()
    Write-Host "Updated $outFile"
}

function Update-TwaManifest([string]$Origin, [string]$ManifestPath) {
    $hostOnly = ([Uri]$Origin).Host
    $raw = Get-Content -Raw -Path $ManifestPath
    $manifest = $raw | ConvertFrom-Json
    $manifest.host = $hostOnly
    $manifest.iconUrl = "$Origin/logo512.png"
    $manifest.maskableIconUrl = "$Origin/maskable-icon-512.png"
    $manifest.webManifestUrl = "$Origin/manifest.webmanifest"
    $manifest.fullScopeUrl = "$Origin/"
    $manifest.startUrl = '/'
    $manifest.packageId = $PackageId
    $manifest.name = 'Raintech HRM'
    $manifest.launcherName = 'HR Daddy'
    Write-Utf8NoBom -Path $ManifestPath -Content ($manifest | ConvertTo-Json -Depth 8)
    Write-Host "Updated twa-manifest host -> $hostOnly"
}

# --- main ---
$Origin = Normalize-TunnelUrl $TunnelUrl
$twaDir = $PSScriptRoot
$manifestPath = Join-Path $twaDir 'twa-manifest.json'
$keystorePath = Join-Path $twaDir 'android.keystore'

Write-Host "==> TWA build for $Origin" -ForegroundColor Cyan

$jdk = Ensure-NoSpaceJdk
Ensure-BubblewrapConfig -JdkPath $jdk
$keytool = Get-KeytoolPath

if (-not (Test-Path $keystorePath)) {
    Write-Host "Creating local upload keystore..."
    & $keytool -genkeypair -v `
        -keystore $keystorePath `
        -alias $KeyAlias `
        -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass $KeystorePassword `
        -keypass $KeystorePassword `
        -dname "CN=HR Daddy TWA, OU=Raintech, O=Raintech Software, L=Local, ST=Dev, C=IN"
}

$sha = Get-CertSha256 -KeystorePath $keystorePath -Alias $KeyAlias -StorePass $KeystorePassword -Keytool $keytool
Write-Host "Keystore SHA-256: $sha"
Write-AssetLinks -Sha256 $sha -Pkg $PackageId
Update-TwaManifest -Origin $Origin -ManifestPath $manifestPath

# Env vars Bubblewrap build uses for non-interactive signing
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = $KeystorePassword
$env:BUBBLEWRAP_KEY_PASSWORD = $KeystorePassword

Push-Location $twaDir
try {
    # Bubblewrap reads ./twa-manifest.json from the current directory.
    Write-Host "==> bubblewrap update" -ForegroundColor Cyan
    npx --yes @bubblewrap/cli update --skipVersionUpgrade
    if ($LASTEXITCODE -ne 0) { throw "bubblewrap update failed ($LASTEXITCODE)" }

    if ($SkipBuild) {
        Write-Host "SkipBuild set - project updated, APK not built."
        return
    }

    Write-Host "==> bubblewrap build (skip PWA Lighthouse over tunnel)" -ForegroundColor Cyan
    npx --yes @bubblewrap/cli build --skipPwaValidation `
        --signingKeyPath="$keystorePath" `
        --signingKeyAlias="$KeyAlias"
    if ($LASTEXITCODE -ne 0) { throw "bubblewrap build failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Done. Sideload the APK from android-twa/ (app-release-signed.apk or similar)." -ForegroundColor Green
Write-Host "Verify asset links: $Origin/.well-known/assetlinks.json"
Write-Host "If you restart cloudflared, re-run this script with the new TunnelUrl."

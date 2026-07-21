# One-time Bubblewrap tooling setup: Android Studio JBR + command-line Android SDK.
# Usage:  .\android-twa\setup-tools.ps1

param(
    [string]$SdkRoot = (Join-Path $env:USERPROFILE '.bubblewrap\android_sdk')
)

$ErrorActionPreference = 'Stop'

$jbr = 'C:\Program Files\Android\Android Studio\jbr'
if (-not (Test-Path (Join-Path $jbr 'bin\java.exe'))) {
    throw "Android Studio JBR not found at $jbr. Install Android Studio or a JDK 17+ and set JAVA_HOME."
}
$env:JAVA_HOME = $jbr
$env:Path = "$(Join-Path $jbr 'bin');$env:Path"

$bwDir = Join-Path $env:USERPROFILE '.bubblewrap'
New-Item -ItemType Directory -Force -Path $bwDir, $SdkRoot | Out-Null

$cmdlineZip = Join-Path $env:TEMP 'commandlinetools-win.zip'
$cmdlineUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
$toolsParent = Join-Path $SdkRoot 'cmdline-tools'
$toolsLatest = Join-Path $toolsParent 'latest'

if (-not (Test-Path (Join-Path $toolsLatest 'bin\sdkmanager.bat'))) {
    Write-Host "Downloading Android command-line tools…" -ForegroundColor Cyan
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        & curl.exe -L --retry 3 --progress-bar -o $cmdlineZip $cmdlineUrl
        if ($LASTEXITCODE -ne 0) { throw "curl download failed ($LASTEXITCODE)" }
    } else {
        Invoke-WebRequest -Uri $cmdlineUrl -OutFile $cmdlineZip
    }

    $extract = Join-Path $env:TEMP 'android-cmdline-extract'
    if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
    if (Test-Path $toolsParent) { Remove-Item -Recurse -Force $toolsParent }
    New-Item -ItemType Directory -Force -Path $extract, $toolsParent | Out-Null

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($cmdlineZip, $extract)
    $extracted = Get-ChildItem $extract -Directory | Select-Object -First 1
    if (-not $extracted) { throw 'Failed to extract cmdline-tools zip' }
    Move-Item $extracted.FullName $toolsLatest
}

# Pre-accept common SDK licenses (avoids interactive sdkmanager prompts)
$licDir = Join-Path $SdkRoot 'licenses'
New-Item -ItemType Directory -Force -Path $licDir | Out-Null
@(
    @{ n = 'android-sdk-license'; v = "24333f8a63b6825ea9c5514f83c2829b004d1fee`n601085b94cd77f0b54ff86406957099ebe79c4d6" },
    @{ n = 'android-sdk-preview-license'; v = '84831b9409646a918e30573bab4c9c91346d8abd' },
    @{ n = 'android-sdk-arm-dbt-license'; v = '859f317696f67ef3d7f30a50a5560e7834b43992' },
    @{ n = 'google-gdk-license'; v = '33b6a2b64607f11b759f320ef9dff4ae5c47d97a' },
    @{ n = 'mips-android-sysimage-license'; v = 'e9acab5b5fbb560a72cfaeccd89279e6403905bb' }
) | ForEach-Object {
    Set-Content -Path (Join-Path $licDir $_.n) -Value $_.v -Encoding ASCII
}

$sdkmanager = Join-Path $toolsLatest 'bin\sdkmanager.bat'
Write-Host "Installing platform-tools / build-tools / android-34…" -ForegroundColor Cyan
& $sdkmanager --sdk_root="$SdkRoot" --install `
    "platform-tools" `
    "platforms;android-34" `
    "build-tools;34.0.0"
if ($LASTEXITCODE -ne 0) { throw "sdkmanager install failed ($LASTEXITCODE)" }

# Bubblewrap requires sdkRoot/bin or sdkRoot/tools (not only cmdline-tools/latest/bin)
$sdkBin = Join-Path $SdkRoot 'bin'
$cmdlineBin = Join-Path $toolsLatest 'bin'
if (-not (Test-Path (Join-Path $sdkBin 'sdkmanager.bat'))) {
    if (Test-Path $sdkBin) { cmd /c "rmdir `"$sdkBin`"" | Out-Null }
    cmd /c "mklink /J `"$sdkBin`" `"$cmdlineBin`"" | Out-Null
}

# Avoid spaces in JDK path (Program Files breaks Bubblewrap's apksigner invoke on Windows)
$bwJdk = Join-Path $bwDir 'jdk'
if (-not (Test-Path (Join-Path $bwJdk 'bin\java.exe'))) {
    if (Test-Path $bwJdk) { cmd /c "rmdir `"$bwJdk`"" | Out-Null }
    cmd /c "mklink /J `"$bwJdk`" `"$jbr`"" | Out-Null
}

$cfg = (@{
    jdkPath        = ($bwJdk -replace '\\', '/')
    androidSdkPath = ((Resolve-Path $SdkRoot).Path -replace '\\', '/')
} | ConvertTo-Json)
$enc = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $bwDir 'config.json'), $cfg, $enc)

Write-Host ""
Write-Host "Bubblewrap tools ready." -ForegroundColor Green
Write-Host "  JDK: $bwJdk  (-> $jbr)"
Write-Host "  SDK: $SdkRoot"
Write-Host "Next: start tunnel, then .\android-twa\build-cloudflare.ps1 -TunnelUrl https://xxxx.trycloudflare.com"

# Android TWA (Bubblewrap) — local Cloudflare testing

Wrap the tenant PWA in a Trusted Web Activity APK for fullscreen Android testing over your existing Cloudflare quick tunnel.

## Prerequisites

- Node.js 20+
- Android Studio (for JBR / JDK 17+)
- Backend on `:3001`, frontend `npm run dev:tunnel` on `:5174`
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (see [PWA_MOBILE.md](./PWA_MOBILE.md))

## One-time: install Bubblewrap Android SDK

```powershell
.\android-twa\setup-tools.ps1
```

This writes `%USERPROFILE%\.bubblewrap\config.json` pointing at:

- JDK: `C:\Program Files\Android\Android Studio\jbr`
- SDK: `%USERPROFILE%\.bubblewrap\android_sdk`

## Local test loop

### 1. Start API + Vite tunnel mode

```powershell
# Terminal A — API :3001
# Terminal B
cd frontend
npm run dev:tunnel
```

### 2. Open Cloudflare HTTPS tunnel

```powershell
# Terminal C — repo root
.\scripts\start-cloudflare-pwa-tunnel.ps1
```

Copy the printed URL, e.g. `https://pride-murphy-gpl-analyses.trycloudflare.com`.

Confirm in a browser:

- `https://<tunnel>/manifest.webmanifest`
- `https://<tunnel>/.well-known/assetlinks.json` (fingerprint filled after first build)

### 3. Build the TWA APK for that host

```powershell
.\android-twa\build-cloudflare.ps1 -TunnelUrl https://xxxx.trycloudflare.com
```

What the script does:

1. Creates `android-twa/android.keystore` (local upload key; gitignored)
2. Writes the keystore SHA-256 into `frontend/public/.well-known/assetlinks.json`
3. Updates `android-twa/twa-manifest.json` host / icon / manifest URLs to the tunnel origin
4. Runs `bubblewrap update` + `bubblewrap build --skipPwaValidation`
5. Produces a signed APK under `android-twa/`

### 4. Install on a phone / emulator

```powershell
# Uses Bubblewrap's adb from the local SDK, or any adb on PATH
& "$env:USERPROFILE\.bubblewrap\android_sdk\platform-tools\adb.exe" install -r android-twa\app-release-signed.apk
```

Launch **HR Daddy**. With valid Digital Asset Links you get a **fullscreen TWA** (no Chrome Custom Tab URL bar).

The build script also regenerates `frontend/public/.well-known/assetlinks.json` from the local keystore so Vite serves it at `https://<tunnel>/.well-known/assetlinks.json`.

### Camera / location on the installed app

Clock-in needs **Camera** and **Location**. The APK enables Android location delegation and declares those permissions.

If prompts were previously denied:

1. Android **Settings → Apps → HR Daddy → Permissions** → allow Camera and Location  
2. Reopen the app → Clock → **Retry** / **Grant Permissions**

Permissions are requested one at a time (camera, then location) so mobile Chrome/TWA does not drop a dialog.

### 5. When the tunnel URL changes

Quick tunnels mint a **new hostname** every restart. Rebuild:

```powershell
.\android-twa\build-cloudflare.ps1 -TunnelUrl https://NEW-HOST.trycloudflare.com
adb install -r …apk
```

The keystore fingerprint stays the same; only the TWA host changes.

## Verify Digital Asset Links

```text
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://YOUR-TUNNEL&relation=delegate_permission/common.handle_all_urls
```

Or open `https://YOUR-TUNNEL/.well-known/assetlinks.json` while Vite is running.

## Package / signing notes

| Item | Value |
|------|--------|
| Application id | `com.raintech.hrm` |
| Local keystore | `android-twa/android.keystore` (default password `android`) |
| Location delegation | Enabled in `twa-manifest.json` (attendance geolocation) |

For Play Store later: point `twa-manifest.json` at the production HTTPS origin, upload an AAB, then add the **Play App Signing** SHA-256 to `assetlinks.json` (in addition to or instead of the upload key).

## Related

- Mobile PWA install: [PWA_MOBILE.md](./PWA_MOBILE.md)
- Manifest / SW: `frontend/vite.config.ts`

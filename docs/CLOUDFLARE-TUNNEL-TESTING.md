# Cloudflare quick tunnels for pre-production testing

Two tunnels — pick the one that matches how testers connect.

## Desktop app (HR Daddy `.exe`) — **API tunnel** (recommended)

Electron calls the API directly. The backend already allows `hrm://` origins.

1. Postgres: `docker compose up -d`
2. API: `backend\target\release\hrm-backend.exe` (port **3001**)
3. Tunnel: `.\scripts\start-cloudflare-api-tunnel.ps1`  
   Copy the `https://….trycloudflare.com` URL (or use `-WriteUrlFile` → `dist\cloudflare-api-url.txt`)
4. Build installer:
   ```powershell
   .\scripts\electron-build-cloudflare.ps1 -TunnelUrl https://YOUR-URL.trycloudflare.com -Target api
   .\scripts\build-tester-bundle.ps1 -TunnelUrl https://YOUR-URL.trycloudflare.com -Target api
   ```
5. Share `dist\pre-production-testers\` installer. **Keep the API tunnel and backend running** while they test.

If you restart `cloudflared`, the URL changes — rebuild the installer with the new URL.

## Browser / phone PWA — **web tunnel** (Vite)

1. Backend on **3001**
2. `cd frontend` → `npm run dev:tunnel`
3. `.\scripts\start-cloudflare-pwa-tunnel.ps1`
4. Open the HTTPS URL on phone/desktop (same-origin `/api` via Vite proxy).

Android APK: `.\android-twa\build-cloudflare.ps1 -TunnelUrl https://….trycloudflare.com` (use the **web** tunnel URL).

## Same PC only (no Cloudflare)

`.\scripts\electron-build-local.ps1` → install `HR-Daddy-Setup-LOCAL-127.0.0.1.exe` with backend on localhost.

## Helper

```powershell
.\scripts\cloudflare-tunnel.ps1 -Mode api   # start API tunnel
.\scripts\cloudflare-tunnel.ps1 -Mode web   # start PWA tunnel
```

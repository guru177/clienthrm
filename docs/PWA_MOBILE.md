# Mobile PWA — install & use

Raintech HRM is a Progressive Web App. On phones, the tenant portal uses a bottom tab bar filtered by the same **RBAC permissions** and **plan modules** as the desktop sidebar.

## Recommended: HTTPS via Cloudflare quick tunnel

Use this for real-phone install testing (Chrome **Install app** needs HTTPS). No local SSL certs required.

### 1. Start API + frontend (tunnel mode)

```powershell
# Terminal A — backend on :3001 (however you normally start it)

# Terminal B — frontend with tunnel-friendly HMR
cd frontend
npm run dev:tunnel
```

`npm run dev:tunnel` runs Vite in `--mode tunnel` so HMR uses **WSS on port 443** (required behind `*.trycloudflare.com`).

### 2. Open the HTTPS tunnel

```powershell
# Terminal C — from repo root
.\scripts\start-cloudflare-pwa-tunnel.ps1
```

Requires [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (`winget install Cloudflare.cloudflared`).

Cloudflare prints a URL like:

`https://least-tvs-manner-spirits.trycloudflare.com`

Open **that** URL on the phone (not `localhost`).

How it works:

- Phone → HTTPS Cloudflare → your PC `:5174` (Vite)
- Browser calls `/api/...` on the **same** HTTPS origin
- Vite proxies `/api` → `http://127.0.0.1:3001`

So there is no mixed-content / CORS fight for normal login + API.

### 3. Install on the phone

**Android Chrome**

1. Open the `https://….trycloudflare.com` link and sign in.
2. Tap **Install** (banner) or menu → **Install app** / **Add to Home screen**.
3. Launch from the home-screen icon (standalone).

**iOS Safari**

1. Open the HTTPS tunnel URL and sign in.
2. Share → **Add to Home Screen**.

### Notes

- Quick-tunnel URLs change every time you restart `cloudflared` — reinstall/re-add if the host changes.
- Keep all three terminals running (API, Vite, tunnel).
- Desktop width (≥768px) still uses the sidebar; bottom tabs are phone-only.
- Splash is **white + plain logo**. If you still see a navy/black splash on an installed PWA, remove the home-screen icon, clear site data for that URL in Chrome, then reinstall — Android caches the old manifest/icons.

## Android TWA (fullscreen APK over the same tunnel)

To wrap this PWA in a Trusted Web Activity APK for local testing, see [ANDROID_TWA.md](./ANDROID_TWA.md). Same Cloudflare tunnel + `assetlinks.json` served from Vite `public/.well-known/`.

## Local-only (no install)

Chrome DevTools → device toolbar → `http://localhost:5174` is fine for layout checks. Install prompts usually need HTTPS (use the tunnel above).

## What you should see on mobile

- Bottom tabs: **Home** (dashboard), Leave, Payslips, Clock (if allowed), **More**
- Header avatar → Profile settings
- More sheet: profile card + Password + remaining RBAC menu
- Offline clock queue only if you have `clock-inout`

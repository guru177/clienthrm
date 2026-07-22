# HR Daddy Desktop — Hotel Daddy API

Standalone Electron desktop build for the production API at **https://hrm-api.hoteldaddy.in**.

This folder documents the separate Hotel Daddy desktop release. The app source lives in `../frontend/`; builds output to `../frontend/release-hoteldaddy/`.

## Prerequisites

- Node.js 20+
- Windows (for NSIS installer)

## Build installer

```bash
cd ../frontend
npm install
npm run electron:build:hoteldaddy
```

Installer output:

```
frontend/release-hoteldaddy/HR-Daddy-HotelDaddy-Setup-1.0.0.exe
```

Uses the same assisted NSIS wizard as the regular desktop build (welcome page, license, install directory, branded header/sidebar — not one-click).

## API configuration

The build script writes:

- `frontend/electron/production-api.json` → `https://hrm-api.hoteldaddy.in`
- `frontend/.env.production` → `VITE_API_URL=https://hrm-api.hoteldaddy.in/api`

Packaged apps call the Hotel Daddy API directly (no localhost proxy).

## Test production API

```bash
python ../scripts/test-production-api.py
```

## Login

Use your **production** tenant credentials (org slug + email + password). Local dev passwords do not apply to `hrm-api.hoteldaddy.in`.

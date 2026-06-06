# HRM

Rust backend plus standalone React frontend.

## Run locally

Backend:

```powershell
cd backend
$env:PORT="3001"   # optional — 3001 is now the default
cargo run
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open the app at:

```text
http://localhost:5174
```

The frontend proxies `/api` requests to the Rust backend at `http://127.0.0.1:3001` (default backend port).

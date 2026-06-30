# How to Connect Biometric Devices

Step-by-step guide for HR admins and IT staff to connect ZKTeco iClock and BIO-PARK attendance devices to Raintech HRM.

**Technical reference (ports, protocols, data flow):** [BIOMETRIC-CONNECTION-PLAN.md](BIOMETRIC-CONNECTION-PLAN.md)

---

## What you need

| Item | Details |
|------|---------|
| HRM backend | Running and reachable on your office LAN |
| Subscription module | Your org plan must include **Biometric** |
| Admin access | Permission to manage attendance / biometric |
| Physical device | ZKTeco iClock or BIO-PARK (fingerprint, face, or card) |
| Network | **Local:** same LAN as server. **Cloud:** office Wi‑Fi/LAN with internet outbound to your cloud server |

---

## Cloud production — one common config for all devices

When HRM runs in the **cloud** (Docker + Caddy on a VPS), every office uses the **same server address**. Only the **device serial number** differs per physical device; each tenant registers their own devices in their admin UI.

### What admins use vs what devices use

| Who | URL / address |
|-----|----------------|
| **HR admin (browser)** | `https://app.yourcompany.com` |
| **Platform super-admin** | `https://platform.yourcompany.com` |
| **Every biometric device** | `http://<cloud-server-ip>:7788` |

Devices **never** use your HTTPS app domain. They cannot use `https://app.yourcompany.com`.

### Common device settings (same for every office)

Configure **every** ZKTeco / BIO-PARK device with these values:

| Field | Value |
|-------|--------|
| Server IP | Your cloud VPS **public IP** (e.g. `203.0.113.10`) |
| Server port | **7788** |
| Protocol | ADMS / iClock (HTTP) |
| HTTPS / SSL | **Off** |
| Upload interval | 1–10 minutes |

Optional: create a DNS A record `bio.yourcompany.com` → same public IP, and use that hostname on devices **only if** your model supports hostnames (many only accept an IP).

### Office network (Wi‑Fi)

At each client office:

1. Connect the device to **office Wi‑Fi** (or Ethernet).
2. The device does **not** need to be on the same LAN as the cloud server.
3. The device must have **internet access** so it can reach `http://<cloud-ip>:7788`.

Traffic flow:

```text
Office Wi‑Fi → device → internet → cloud server :7788 → HRM backend
```

### Cloud server checklist (IT / DevOps)

1. Deploy with `deploy/docker-compose.production.yml` (port **7788** is published on Caddy).
2. Open **inbound TCP 7788** on the cloud firewall / security group.
3. Prefer restricting **7788** to known office public IP ranges (not open to `0.0.0.0/0` if possible).
4. Keep `HOST=0.0.0.0` and `BIOMETRIC_PORT=7788` in `deploy/.env`.
5. Verify from outside:

   ```bash
   curl "http://<cloud-public-ip>:7788/iclock/cdata?SN=probe&options=all"
   ```

   Expected: HTTP `200`.

### Per-tenant steps (unchanged)

Even with one shared cloud IP, each organization still:

1. Logs in at `https://app.yourcompany.com`
2. Registers **their** device serial under **Admin → Biometric**
3. Maps **their** employee PINs

HRM routes punches to the correct tenant by **registered serial number** (`organization_id` on `biometric_devices`).

### Example

| Item | Value |
|------|--------|
| Cloud VPS public IP | `203.0.113.10` |
| Tenant app | `https://app.raintech.in` |
| **All devices — Server IP** | `203.0.113.10` |
| **All devices — Port** | `7788` |
| Office A device SN | `A250902070` (registered in Org A) |
| Office B device SN | `B180304012` (registered in Org B) |

Both offices point devices at `203.0.113.10:7788`. Data stays isolated by serial + org registration.

---

## Important: two different ports

| Service | Port | Used by |
|---------|------|---------|
| **HRM API** (admin login, attendance UI) | **3001** | Browser / mobile app |
| **Biometric device push** (iClock / ADMS) | **7788** | Physical attendance device |

Devices **do not** connect to port 3001. Always point the device to **7788** using plain HTTP (no HTTPS).

When you run `cargo run` in `backend`, both ports start automatically.

---

## Quick setup checklist

- [ ] Backend running with `HOST=0.0.0.0`
- [ ] Firewall allows inbound **7788** from the device subnet
- [ ] Device registered in HRM **before** connecting
- [ ] Device server IP = server **LAN IP** (not `127.0.0.1`)
- [ ] Device server port = **7788**
- [ ] Employees enrolled on device and **PIN mapped** in HRM
- [ ] Test punch appears in **Punch log** and **Attendance**

---

## Step 1 — Prepare the server

### Local development (Windows / Mac / Linux)

```powershell
cd backend
cargo run
```

Verify:

- API: `http://127.0.0.1:3001/api/health` → `200 OK`
- Biometric port: `http://127.0.0.1:7788/iclock/cdata?SN=probe&options=all` → `200 OK`

Find your **LAN IP** (the address devices will use):

```powershell
# Windows
ipconfig

# Linux / Mac
ip addr   # or: ifconfig
```

Example: `172.16.1.50` — use this on the device, **not** `localhost`.

### Production (Docker / cloud VPS)

See [PRODUCTION.md](PRODUCTION.md) and the [Cloud production](#cloud-production--one-common-config-for-all-devices) section above. Ensure:

- `HOST=0.0.0.0` in `deploy/.env`
- Port **7788** exposed on the cloud firewall (Caddy publishes it in compose)
- Biometric stays on **plain HTTP** at `http://<public-ip>:7788`
- All devices use the **same public IP**; tenants differ by registered serial number

### Backend environment variables

In `backend/.env` (see `backend/.env.example`):

```env
HOST=0.0.0.0
PORT=3001
BIOMETRIC_PORT=7788
BIO_PARK_TCP_PORT=5010
```

Optional hardening:

```env
BIOMETRIC_STRICT_IP=1
```

When enabled, punches are only accepted from the IP address stored on the registered device row.

---

## Step 2 — Register the device in HRM

1. Sign in to the tenant app as an admin.
2. Open **Admin → Biometric** (`/admin/biometric`).
3. On the physical device, go to **Menu → System → Device Info** and note the **Serial Number** (e.g. `A250902070`).
4. In HRM, click **Register Device**.
5. Enter the serial number **exactly** as shown on the device.
6. Optionally set name and location (e.g. "Main gate", "Floor 2").

> **Security note:** Unregistered serial numbers get a handshake response but **no punches are stored**. Always register first.

---

## Step 3 — Configure the physical device

On the device, open **Menu → Communication** or **Server** (labels vary by model):

| Field | Value |
|-------|--------|
| Server IP | Your HRM server **LAN IP** |
| Server port | **7788** |
| Protocol | ADMS / iClock (HTTP) |
| HTTPS / SSL | **Off** |
| Upload interval | 1–10 minutes (default is fine) |

Save settings and **reboot the device**.

**Device server URL format:**

```text
http://<server-lan-ip>:7788
```

Example: `http://172.16.1.50:7788`

---

## Step 4 — Confirm the device is online

Back in **Admin → Biometric → Devices**:

| Check | Expected |
|-------|----------|
| Status indicator | Green = online |
| IP address column | Shows the device's LAN IP |
| Last heartbeat | Updates within a few minutes |

The device polls HRM with:

```text
GET /iclock/cdata?SN=<serial>&options=all
```

If offline, see [Troubleshooting](#troubleshooting) below.

---

## Step 5 — Enroll employees on the device

On the physical device:

1. Add each employee (fingerprint, face, or card).
2. Note each employee's **PIN** (user ID on device, e.g. `1001`, `1002`).

In HRM:

1. Go to **Admin → Biometric → Map PIN** (or the PIN mapping tab).
2. Select the device.
3. Enter the device PIN.
4. Select the matching HRM employee.
5. Save.

Repeat for every employee who will punch on that device.

---

## Step 6 — Test a punch

1. Ask an enrolled employee to scan on the device.
2. In HRM, open **Punch log** — the punch should appear within seconds (live feed via WebSocket).
3. Open **Attendance** — a check-in or check-out should be created for mapped users.

### How punches become attendance

| Scan order | Result |
|------------|--------|
| First scan of the day (mapped user) | Check **in** |
| Second scan | Check **out** |
| Third scan | Check **in** again (new session) |

Unmapped PINs are stored in the punch log but do not update attendance until you add a mapping.

---

## Supported devices

| Brand / protocol | Transport | Port |
|------------------|-----------|------|
| ZKTeco iClock | HTTP `/iclock/*` | 7788 |
| BIO-PARK ADMS | HTTP `/pub/chat`, `/pub/getrequest` | 7788 |
| BIO-PARK TCP (optional) | Binary TCP | 5010 |

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| Device shows offline | Wrong IP or port | Use server **LAN IP** and port **7788** |
| Device offline | Firewall blocking | Allow inbound TCP **7788** from office subnet |
| Works on server PC only | `HOST=127.0.0.1` | Set `HOST=0.0.0.0` and restart backend |
| Handshake OK, no punches | Serial not registered | Re-register exact SN from device menu |
| Punches in log, no attendance | PIN not mapped | Map PIN → employee in **Map PIN** |
| Punches ignored | Strict IP mismatch | Set `BIOMETRIC_STRICT_IP=0` in dev, or update device IP in HRM |
| Used port 3001 by mistake | Wrong port configured | Change device port to **7788** |
| Duplicate ghost devices | Old test registrations | Delete unused rows in **Devices** tab |

### Manual connectivity test

From any PC on the same network as the device:

```powershell
curl "http://<server-ip>:7788/iclock/cdata?SN=probe&options=all"
```

Expected: HTTP `200` and a plain-text iClock options block.

### Backend logs

With `RUST_LOG=info` in `backend/.env`, look for:

```text
Handshake from device SN=...
```

---

## Production security tips

1. Restrict ports **7788** and **5010** to your office VLAN or VPN only.
2. Enable `BIOMETRIC_STRICT_IP=1` after the device IP is stable.
3. Remove test devices with wrong serial numbers.
4. Each tenant (organization) only sees its own devices — SaaS isolation is enforced by `organization_id`.

---

## Automated verification (developers / QA)

```powershell
# Backend must be running on :3001 and :7788
python scripts/test-biometric-suite.py
```

This runs 22 automated cases: handshake, punch ingest, PIN mapping, attendance sync, and tenant isolation.

---

## Quick reference

| Item | Value |
|------|--------|
| Admin UI | `http://localhost:5174/admin/biometric` (dev) |
| API health | `http://localhost:3001/api/health` |
| Device push URL | `http://<server-lan-ip>:7788` |
| Register device first? | **Yes** — serial must exist in HRM |
| HTTPS on device port? | **No** — use plain HTTP |

---

## Related docs

- [BIOMETRIC-CONNECTION-PLAN.md](BIOMETRIC-CONNECTION-PLAN.md) — architecture, data flow, QA details
- [modules/biometric.md](modules/biometric.md) — API routes and database tables
- [PRODUCTION.md](PRODUCTION.md) — Docker, Caddy, firewall for production
- [TESTER-GUIDE.md](TESTER-GUIDE.md) — manual QA scenarios for attendance

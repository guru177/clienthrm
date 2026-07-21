# Biometric Devices

## Overview

Integrate ZKTeco iClock and BIO-PARK devices for automatic attendance punches, plus a **generic Punch Push API** for any other brand via bridge/middleware. Admin UI for device registration, user PIN mapping, ingest keys, punch log, and live feed.

**Setup guide:** [BIOMETRIC-DEVICE-SETUP.md](../BIOMETRIC-DEVICE-SETUP.md) — step-by-step for admins and IT.

## Plan module

- **Key:** `biometric`
- **Permissions:** `view-attendance` (read), `manage-attendance` (write)

## Frontend

| Route | Page |
|-------|------|
| `/admin/biometric` | `pages/admin/biometric/index.tsx` |

**Hook:** `hooks/use-biometric-live.ts` — WebSocket live punches

Tabs: Statistics, Punch Log, PIN Mapping, Devices, **Push API** (ingest keys + curl sample).

## Backend

**Handlers:** `handlers/biometric.rs`, `bio_park_tcp.rs`, `biometric_events.rs`

### Admin API (JWT required)

| Method | Path |
|--------|------|
| GET/POST | `/api/admin/biometric/devices` |
| DELETE | `/api/admin/biometric/devices/{id}` |
| GET | `/api/admin/biometric/punches` |
| GET/POST | `/api/admin/biometric/mapping` |
| DELETE | `/api/admin/biometric/mapping/{id}` |
| GET | `/api/admin/biometric/stats` |
| GET | `/api/admin/biometric/ws?token=` | Live WebSocket |
| GET/POST | `/api/admin/biometric/ingest-keys` |
| DELETE | `/api/admin/biometric/ingest-keys/{id}` | Soft-revoke |

### Device protocols (no JWT)

Bound on **`BIOMETRIC_PORT`** (default 7788) and **`BIO_PARK_TCP_PORT`** (5010):

| Protocol | Endpoints |
|----------|-----------|
| iClock | `GET/POST /iclock/cdata`, `GET /iclock/getrequest`, `POST /iclock/devicecmd` |
| BIO-PARK ADMS | `GET/POST /pub/chat`, `GET /pub/getrequest` |
| BIO-PARK TCP | Binary listener on port 5010 |

### Generic Punch Push API (ingest key, no JWT)

On the **main API** port (not 7788):

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/integrations/biometric/punches` | `Authorization: Bearer hrm_bio_…` or `X-Biometric-Key` |

Body (single or batch): `device_serial`, `device_pin`, `punch_time`, optional `punch_type` (0/1). Reuses `store_incoming_punch` + device touch.

**Brand guidance:** eSSL — try ADMS/iClock on 7788 first; otherwise Push API. Hikvision / Suprema / Matrix / others — Push API or vendor middleware → Push API.

## Database

| Table | Purpose |
|-------|---------|
| `biometric_devices` | Serial number, IP, org, name |
| `biometric_punches` | Raw device events |
| `biometric_user_map` | Device PIN → `user_id` |
| `biometric_commands` | Pending device commands queue |
| `biometric_ingest_keys` | Hashed Push API keys (`key_prefix`, `key_hash`, `revoked_at`) |

## Workflows

### Register device

1. Add device in UI with serial number and org.
2. Configure physical device server IP = host LAN IP, port **7788** (ZKTeco / BIO-PARK), **or** use Push API for other brands.
3. Device handshake → `iclock_handshake` validates SN (native path).

### Map employee

1. Note user's PIN on device.
2. `POST /api/admin/biometric/mapping` links PIN + device → user.
3. ATTLOG / Push API punches create attendance or punch log entries.

### Security

- Unregistered serials: handshake returns OK but no data stored; Push API rejects unknown/wrong-org serials.
- Ingest keys: plaintext shown once; stored as SHA-256 hash; revocable.
- `BIOMETRIC_STRICT_IP=1`: reject native punches from IPs not matching registered device.

## Related modules

- [Attendance](attendance.md)

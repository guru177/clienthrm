# Biometric Devices

## Overview

Integrate ZKTeco iClock and BIO-PARK devices for automatic attendance punches. Admin UI for device registration, user PIN mapping, punch log, and live feed.

**Setup guide:** [BIOMETRIC-DEVICE-SETUP.md](../BIOMETRIC-DEVICE-SETUP.md) — step-by-step for admins and IT.

## Plan module

- **Key:** `biometric`
- **Permissions:** `view-attendance` (read), `manage-attendance` (write)

## Frontend

| Route | Page |
|-------|------|
| `/admin/biometric` | `pages/admin/biometric/index.tsx` |

**Hook:** `hooks/use-biometric-live.ts` — WebSocket live punches

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

### Device protocols (no JWT)

Bound on **`BIOMETRIC_PORT`** (default 7788) and **`BIO_PARK_TCP_PORT`** (5010):

| Protocol | Endpoints |
|----------|-----------|
| iClock | `GET/POST /iclock/cdata`, `GET /iclock/getrequest`, `POST /iclock/devicecmd` |
| BIO-PARK ADMS | `GET/POST /pub/chat`, `GET /pub/getrequest` |
| BIO-PARK TCP | Binary listener on port 5010 |

## Database

| Table | Purpose |
|-------|---------|
| `biometric_devices` | Serial number, IP, org, name |
| `biometric_punches` | Raw device events |
| `biometric_user_map` | Device PIN → `user_id` |
| `biometric_commands` | Pending device commands queue |

## Workflows

### Register device

1. Add device in UI with serial number and org.
2. Configure physical device server IP = host LAN IP, port **7788**.
3. Device handshake → `iclock_handshake` validates SN.

### Map employee

1. Note user's PIN on device.
2. `POST /api/admin/biometric/mapping` links PIN + device → user.
3. ATTLOG punches create attendance or punch log entries.

### Security

- Unregistered serials: handshake returns OK but no data stored.
- `BIOMETRIC_STRICT_IP=1`: reject punches from IPs not matching registered device.

## Related modules

- [Attendance](attendance.md)

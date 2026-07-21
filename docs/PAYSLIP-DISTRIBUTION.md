# Payslip distribution — how it works

This guide explains how payslips are generated, turned into **A4 PDFs**, and delivered to employees by **email**, portal, ZIP download, or WhatsApp.

---

## 1. End-to-end flow

```
Attendance + Leave + Salary profile
           │
           ▼
   Payroll preview (draft figures)
           │
           ▼
   Generate payslips  ──optional──►  Email all new payslips (PDF)
           │                              │
           ▼                              ▼
   status = "generated"            Employee inbox
           │
           ├──► My Payslips (employee portal)
           ├──► View / Download PDF (HR or employee)
           ├──► Email one payslip (HR)
           ├──► Email all for month (HR)
           ├──► Bulk ZIP of PDFs (HR)
           └──► WhatsApp link (HR, manual)
```

A payslip must be in **`generated`** status before it can be emailed or downloaded as a final PDF. Draft payslips are preview-only.

---

## 2. Who can do what

| Action | Permission | Where |
|--------|------------|--------|
| Preview / generate payroll | `manage-payroll` | Payroll page |
| Email payslips | `manage-payroll` | Payroll, Employee payslips |
| Download PDF / ZIP | `view-payroll` or own payslip | Payroll, My Payslips |
| View own payslips | `view-my-payslips` (or employee role) | My Payslips |

---

## 3. SMTP (email delivery)

Outgoing mail uses **organization App Settings first**, then falls back to the server **`.env`**.

### Priority

| Order | Source | Keys |
|-------|--------|------|
| 1 | **App Settings** → Email Configuration | `mail_host`, `mail_port`, `mail_username`, `mail_password`, `mail_encryption`, `mail_from_address`, `mail_from_name` |
| 2 | Legacy keys (if present) | `smtp_host`, `smtp_user`, `smtp_pass`, … |
| 3 | **Backend `.env`** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` / `SMTP_PASSWORD`, `SMTP_FROM` |

Settings are read **at send time** from the database — no backend restart is required after saving App Settings.

### Configure (tenant admin)

1. Go to **App Settings** → **Email Configuration**.
2. Enter host, port, username, password, encryption (TLS / SSL), from address and name.
3. Save.

Example (Hostinger):

| Field | Example |
|-------|---------|
| Mail host | `smtp.hostinger.com` |
| Mail port | `587` |
| Mail encryption | TLS |
| Mail username | `info@raintech.in` |
| Mail from address | `info@raintech.in` |
| Mail from name | `Raintech HRM` |

### Dev fallback (`.env`)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=app-password
SMTP_FROM=your@gmail.com
FRONTEND_URL=http://localhost:5174
```

`FRONTEND_URL` is used for the **“View My Payslips”** link in emails.

### Code

- Shared resolver: `backend/src/smtp_config.rs`
- Used by: payslip email, job application email, password-reset OTP (org-scoped where applicable)

---

## 4. PDF generation

Payslips are rendered server-side as **A4 PDF** (not HTML attachments).

| Module | Role |
|--------|------|
| `payslip_render.rs` | Loads payslip + org settings from DB; `fmt_inr()` currency formatting |
| `payslip_pdf.rs` | Builds PDF with **genpdf** (Arial fonts in `backend/assets/fonts/`) |

### PDF contents

- Company name, address, PAN/PF (from App Settings)
- Pay period and reference number
- Employee name, ID, department, designation
- **Net pay** (prominent)
- Attendance summary: working days, present, leave, holidays
- **Earnings** — component lines when stored; otherwise consolidated gross
- **Deductions** — only non-zero lines + total
- Footer: computer-generated notice

### Download / open PDF

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/admin/payslips/{id}/pdf` | `application/pdf` |

Frontend (`lib/payslip-pdf.ts`) opens the blob in a new browser tab.

---

## 5. Email payslips

### What the employee receives

1. **HTML email** — branded summary (gross, deductions, net) + button to My Payslips  
2. **PDF attachment** — full A4 payslip (`Payslip_{Name}_{Month}_{Year}_{id}.pdf`)

### Ways to send

| Method | UI | API |
|--------|-----|-----|
| On generate | Payroll → checkbox **“Email payslip to employees after generate”** (default on) | `POST /api/admin/payroll/generate` with `"send_emails": true` |
| One employee | Employee payslips → **Email** | `POST /api/admin/payslips/{id}/send-email` |
| Whole month | Payroll → **Email All Payslips** | `POST /api/admin/payslips/bulk-send-email` `{ "month": 6, "year": 2026 }` |
| Selected IDs | — | `POST /api/admin/payslips/bulk-send-email` `{ "payslip_ids": [37, 38] }` |

### Requirements

- Payslip status = **`generated`**
- Employee **`users.email`** must be a valid address (contains `@`)
- SMTP configured (App Settings or `.env`)

Skipped employees are reported in the API response (`sent`, `skipped`, `errors`).

### Code

- `backend/src/payslip_email.rs` — `send_payslip_email()`, `bulk_send_payslip_emails()`
- Handlers: `handlers/payslips.rs`, `handlers/payroll.rs` (post-generate batch)

---

## 6. Other distribution channels

| Channel | How |
|---------|-----|
| **Employee portal** | `/admin/my-payslips` — list + view PDF |
| **Bulk ZIP** | Payroll → download ZIP; `POST /api/admin/payslips/bulk-download` — one PDF per file |
| **WhatsApp** | Employee payslips → WhatsApp (opens wa.me with message; no auto-send) |

Portal is always available after generate; email is optional and explicit.

---

## 7. Admin UI walkthrough

### Generate and email in one step

1. **Payroll** → select month/year.
2. Run **Preview** and review figures.
3. Ensure **“Email payslip to employees after generate”** is checked.
4. Click **Generate**.
5. Toast shows generate count; if email ran, shows how many were sent/skipped.

### Email later

1. **Payroll** → **Email All Payslips (N)** for the current month, or  
2. **Salaries → Employees → [employee] → Payslips** → **Email** on a row.

### Employee experience

1. Receives email with summary + PDF.
2. Can also log in → **My Payslips** → **View** (same PDF).

---

## 8. API examples

### Login

```http
POST /api/auth/login
{ "email": "admin@example.com", "password": "…", "org_slug": "acme" }
```

### Generate with email

```http
POST /api/admin/payroll/generate
Authorization: Bearer <token>

{
  "month": 6,
  "year": 2026,
  "send_emails": true
}
```

Response includes `data.email`: `{ "sent", "skipped", "errors" }`.

### Send one payslip

```http
POST /api/admin/payslips/37/send-email
Authorization: Bearer <token>
```

### Bulk email for month

```http
POST /api/admin/payslips/bulk-send-email
Authorization: Bearer <token>

{ "month": 6, "year": 2026 }
```

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `SMTP not configured` | No host in App Settings or `.env` | Set mail host + credentials |
| `535 authentication failed` | Wrong password or host | Re-enter **Mail password** in App Settings; verify TLS/port |
| Employee skipped | No email on user profile | Edit user → add email |
| `Only generated payslips can be emailed` | Payslip still draft | Generate payroll first |
| Email works from `.env` but not Hostinger | App Settings override `.env` | Fix App Settings credentials (they take priority) |
| Net pay ₹0 but gross > deductions | Payroll data for that employee | Re-preview/regenerate; check LOP and deductions |
| PDF looks empty on earnings | Components not stored on payslip row | Only gross stored → PDF shows consolidated gross line |

### Manual test script

```powershell
python scripts/test-payslip-email-send.py
```

Sends the latest generated payslip to a test address (see script for `TARGET_EMAIL`).

---

## 10. Related files

| Area | Path |
|------|------|
| PDF render | `backend/src/payslip_pdf.rs` |
| Email send | `backend/src/payslip_email.rs` |
| SMTP config | `backend/src/smtp_config.rs` |
| Payslip data | `backend/src/payslip_render.rs` |
| API routes | `backend/src/routes.rs` |
| Payroll generate + email flag | `backend/src/handlers/payroll.rs` |
| Payslip handlers | `backend/src/handlers/payslips.rs` |
| Frontend helpers | `frontend/src/lib/payslip-pdf.ts` |
| Payroll UI | `frontend/src/pages/admin/payroll/index.tsx` |
| App Settings (SMTP) | `frontend/src/pages/admin/settings/app-settings.tsx` |

---

## 11. Related docs

- [Payroll module](modules/payroll.md) — salary setup, preview, generate API
- [App Settings / SMTP](modules/settings.md) — mail configuration
- [Tester guide — Payroll](TESTER-GUIDE.md#84-payroll-and-payslips) — QA steps

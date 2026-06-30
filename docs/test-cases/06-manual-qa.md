# Manual QA Test Cases

Automated suites do not replace exploratory QA. Use the tenant checklist for sign-off.

## Primary checklist

**New testers:** start with [TESTER-GUIDE.md](../TESTER-GUIDE.md) (setup, smoke test, manual steps in simple language).

See [TENANT-QA-CHECKLIST.md](../TENANT-QA-CHECKLIST.md) — 19 sections, ~90+ items covering:

1. Auth & onboarding
2. Users & roles
3. Attendance & shifts
4. Leave & holidays
5. Payroll & payslips
6. Biometric devices
7. Workflows & tasks
8. Reports
9. Chat & notifications
10. Subscription & billing
11. Security sign-off

## When to run manual QA

- Before production deploy
- After schema migrations
- After payroll/statutory rule changes
- After UI redesign of critical flows (login, payroll generate, leave approve)

## Traceability

Map manual sections to automated suites:

| Manual section | Automated coverage |
|----------------|-------------------|
| Attendance | PA-xx, SP-xx, HI-xx, ATF |
| Leave | HI-21–30, APIW leave step, E2E-08 |
| Payroll | PC-xx, PA-xx, SP-10/11, E2E-04–06 |
| Security | SEC-xx |
| All modules | MOD-xx, UI-xx, FM |

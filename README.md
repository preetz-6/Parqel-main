# Parqel

Parking accountability for closed campuses — colleges, IT parks, gated communities.

Someone parks badly, blocks your spot, or takes a fire lane. You snap a photo, enter the plate, and the vehicle's owner gets notified. That's it. No fines, no public shaming, no government databases — just a private alert between two people who share the same lot.

The whole thing works because both parties are already in the organisation's roster. Plate-to-owner mapping comes from HR/admin data, not from any external lookup. No strangers, no cold start problem.

## What it does

**For employees** — view your assigned parking spot, check in, find your vehicle, book shared/event slots, report violations, file appeals, issue visitor passes, and raise emergency alerts for blocked fire lanes.

**For security** — triage incoming reports (with photo evidence and optional OCR), scan visitor passes at the gate, log unknown vehicles, and respond to dispatch assignments. Guards are zone-scoped, so Block A's guard only sees Block A's queue.

**For supervisors** — approve or reject violations, review appeals (cross-shift, so you never review your own decision), manage zones and spots, create events that temporarily repurpose parking areas, and dispatch guards.

**For admins** — onboard users and vehicles via CSV import, assign roles, approve vehicle registrations, view the full audit trail, and manage org settings. Admins manage people and data; they don't make parking decisions.

## How violations work

1. Someone files a report — photo required, GPS attached, plate typed in (OCR optional)
2. A guard triages it — confirms the plate, matches it to a registered vehicle
3. A supervisor approves or rejects
4. The vehicle's owner gets a push notification and an in-app alert
5. Owner can appeal — reviewed by a *different* supervisor than whoever approved it

A reporter can never approve their own report. This is enforced in code, not policy.

## Zone types

| Type | Vehicles | Spots | Use case |
|---|---|---|---|
| Fixed | Four-wheeler | Numbered, assigned | Faculty/staff with dedicated bays |
| Shared | Four-wheeler | Numbered, bookable | First-come time-boxed holds with auto-release on no-show |
| Event | Mixed | Numbered, bookable | Convocation takes over staff parking — displaced holders get notified |
| Two-wheeler | Two-wheeler | None — capacity only | Bike sheds. You can't number 200 bikes in a row |

## Visitor management

Employees can issue QR-based visitor passes (5 per week by default). Guards scan them at the gate. A second scan isn't refused — the guard is told "already checked in at 09:14" and uses their judgement. Unknown vehicles are checked against the registry first so a typo doesn't create a false unknown.

## What's deliberately not here

These aren't missing features — they were considered and cut. See [DESIGN.md](docs/DESIGN.md) for the reasoning.

- **Fines and payments** — needs finance sign-off, a payment gateway, GST, refunds on appeal. Repeat-offender counts carry most of the deterrent without any of that.
- **SMS/voice alerts** — requires TRAI DLT registration, which is a multi-week dependency on someone else's admin office. Push + in-app only for now.
- **Self-registration** — if anyone can claim any plate, the owner mapping is worthless. Both auth paths (Google SSO and employee ID + OTP) must resolve to an existing roster user.
- **Public violation feed** — a searchable log of where identifiable vehicles have been is a stalking tool. Alerts are private.
- **Automatic parking sessions / live occupancy** — a geofence detects the phone, not the car. Manual checkout drifts to 100% occupied within a week.

## Built with

Next.js 16 · React 19 · TypeScript · Prisma 7 · PostgreSQL · Tailwind 4 · Supabase (photo storage)

## Current status

**Phases A through E are complete:**

- **A** — Schema, RBAC, audit trail, auth (Google SSO + OTP), admin console, CSV import
- **B** — The core loop: report → triage → approve → notify → appeal
- **C** — Gate ops: visitor passes, unknown vehicle logging, emergency alerts, guard dispatch
- **D** — Allocation: shared/event booking, hold-and-release, events overriding fixed zones
- **E** — Plate Recognizer OCR, analytics dashboards, audit log viewer

Google SSO and OCR are built but **unverified against live services** — no credentials exist yet. The system runs fine without them: sign in with an employee ID and OTP, report plates by typing them.

## Project structure

```
prisma/schema.prisma        Domain model (18 tables)
src/proxy.ts                Session check only — no authorization here
src/server/
  dal.ts                    authorize() — where authorization actually lives
  permissions.ts            Role × zone-scope matrix, no wildcards
  rules.ts                  Integrity rules that outrank the permission matrix
  audit.ts                  audited() — mutation + audit log in one transaction
  auth/                     Google SSO and employee-ID/OTP login
  import/                   CSV import with preview and per-row validation
  violations/               OCR integration, plate normalisation
src/app/
  (employee)/               Employee dashboard, parking, vehicles, violations, passes
  security/                 Guard/supervisor queue, triage, dispatch, gate scan
  admin/                    Admin console — users, analytics, audit, imports, events
docs/
  DESIGN.md                 What this system refuses to do and why
  ROLES.md                  Roles, permission matrix, integrity rules
```

## Documentation

- [**DESIGN.md**](docs/DESIGN.md) — the decisions behind the system, what was cut and why
- [**ROLES.md**](docs/ROLES.md) — the four roles, the full permission matrix, zone scoping, and the four integrity rules that outrank everything

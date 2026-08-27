# Parqel

Closed-campus parking accountability for a single organisation — a college or
an IT company.

Report a badly parked vehicle, and the owner gets notified. Everyone and every
vehicle comes from the organisation's own roster, which is what makes
plate-to-owner mapping trustworthy without touching any government database.

**The hypothesis v1 exists to test:** in a closed lot, notifying an identified
owner changes parking behaviour.

---

## Getting started

You need Node 20+. You do **not** need to install Postgres — Prisma 7 ships a
local one.

```bash
npm install
```

```bash
cp .env.example .env
```

Generate a session secret and paste it into `.env` as `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Start the local database:

```bash
npx prisma dev --name parqel --detach
```

> **Do not use the URL it prints.** It points at `template1`, and that server
> serves one logical database while ignoring the database name — so migrations
> fail with *"type already exists"*. Run the bootstrap script instead, which
> prints the two URLs to put in `.env`:

```bash
npx tsx scripts/bootstrap-db.ts
```

Then set up the schema and load a demo campus:

```bash
npm run db:migrate && npm run db:demo
```

> `db:demo` adds a worked scenario — reports at every stage of review, a
> pending appeal, gate activity and completed parking — so the queues and
> analytics have something in them. Use `db:seed` instead for a bare campus.
> **Showing this to someone? Follow [docs/DEMO.md](docs/DEMO.md).**

```bash
npm run dev
```

Sign in at http://localhost:3000/login with any employee ID printed by the
seed (`ADM001`, `PRK001`, `SEC001`, `SEC002`, `FAC101`, `STU2201`).

`OTP_PROVIDER=console`, so **login codes are printed in the dev-server
terminal** rather than sent by SMS. Google SSO stays hidden until you set
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

---

## Scripts

| | |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Test suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:seed` | Reset and reseed demo data |
| `npm run db:studio` | Browse the database |
| `npm run audit:tail` | Print recent audit entries |

> On a fresh clone `npm run typecheck` fails until Next has generated its
> route types. Run `npm run dev` once, or `npx next typegen`.

---

## Layout

```
prisma/schema.prisma      18 tables — the domain model
src/proxy.ts              Bounces requests with no session cookie. No authorization.
src/server/
  permissions.ts          Role × scope matrix. No wildcards.
  rules.ts                Integrity rules that outrank the matrix.
  dal.ts                  authorize() — where authorization actually happens.
  audit.ts                audited() — change + log row in one transaction.
  auth/                   Google SSO and employee-ID/OTP.
  import/                 CSV import with preview and per-row validation.
src/app/admin/            Admin console.
docs/                     Design decisions. Read these first.
```

---

## Read before contributing

- **[docs/DESIGN.md](docs/DESIGN.md)** — what this refuses to do and why.
  Fines, SMS, automatic parking sessions and live occupancy are all cut
  deliberately, not missing.
- **[docs/ROLES.md](docs/ROLES.md)** — the five roles, the permission matrix,
  and the four integrity rules.

Three things that are load-bearing and easy to break:

1. **No self-registration.** Both auth paths must resolve to an existing
   roster user. A Google account verified but absent from the roster is
   refused and creates nothing.
2. **A reporter can never decide their own report.** Without this the system
   is a harassment tool. It is enforced in code, not convention.
3. **Nothing is hard-deleted.** Violations are voided with a written reason,
   and every mutation commits with its audit row in the same transaction.

Status: **Phases A–E complete.** Foundation and RBAC; the report → triage →
approve → notify loop; gate operations (visitor passes, unknown vehicles,
dispatch); booking with holds, events and entitlements; OCR, analytics and the
audit viewer.

Two things are built but **unverified against their real services**, because
no credentials exist yet: Google Workspace SSO and Plate Recognizer OCR. Both
are off by default and the system runs without them — sign in with an employee
ID and OTP, and report plates by typing them.

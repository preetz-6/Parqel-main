# Running a demo

Everything below has been run end to end. If a step behaves differently,
check [Troubleshooting](#troubleshooting) — the two failure modes are both
environmental, not code.

---

## 1. Start it

Four commands from a cold machine. Run them in order.

```bash
npm install
```

Start the local database. **Ignore the URL it prints** — see
[Troubleshooting](#troubleshooting) for why:

```bash
npx prisma dev --name parqel --detach
```

Create the app database and print the two URLs for `.env`:

```bash
npx tsx scripts/bootstrap-db.ts
```

Copy `.env.example` to `.env`, paste in those two URLs, and generate a session
secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then create the schema and load the demo scenario:

```bash
npm run db:migrate && npm run db:demo
```

```bash
npm run dev
```

Open **http://localhost:3000**.

> `npm run db:demo` wipes and reloads. Run it again any time to reset the demo
> to a known state — including between rehearsal and the real thing.

---

## 2. Signing in

There is no password and no sign-up. Enter an employee ID, and the code is
**printed in the terminal running `npm run dev`** — not sent by SMS.

```
[OTP] +91 ****** 0005 -> 184160  (expires in 300s)
```

Keep that terminal visible during the demo; you will switch users often.

| Employee ID | Person | Role | Use them to show |
|---|---|---|---|
| `FAC101` | Dr. Meera Krishnan | Employee (faculty) | Reporting, alerts, appeals, booking |
| `STU2201` | Arjun Menon | Employee (student) | Entitlements — blocked from the faculty lot |
| `SEC002` | Lakshmi Devi | Guard, **scoped to 2 zones** | Triage, gate scan, unknown vehicles |
| `SEC001` | Anand Rao | Security Supervisor | Approving violations, dispatch |
| `PRK001` | Rakesh Iyer | Parking Admin | Import, events, appeals, analytics |
| `ADM001` | Priya Nair | Administrator | Full audit log |

> Only 3 codes per employee per 15 minutes. If you are rehearsing heavily,
> spread across users or wait it out.

---

## 3. A twelve-minute walkthrough

This is the order that tells the clearest story. Each step is a real flow, not
a mock.

### The core loop — why the system exists (5 min)

**As `FAC101`** → **Report a vehicle**

Attach any photo, type a plate, pick a zone, file it. Point out that the photo
is mandatory and the reporter is **never told who owns the vehicle** — that is
what stops this becoming a lookup service.

**As `SEC002`** (guard) → **Security queue**

One report is awaiting verification. Open it. The guard sees registry
candidates matched against the typed plate and confirms which vehicle it is —
this is the human-in-the-loop step.

> Also open the second item, *Wrong slot* on `KA01AB4567`. The reporter typed
> `KA01AB4S67` — an S for a 5. The registry match caught it. That is the
> confusable-character handling doing real work.

**As `SEC001`** (supervisor) → approve it.

**Back as `FAC101`** → the alert is on their home page with an acknowledge
button.

### The rule that makes it safe to deploy (1 min)

Still as `SEC001`, open a report **they** filed. The system refuses:

> *You filed this report, so you cannot verify or decide it.*

Say plainly what this prevents: without it, one colleague can file and
self-approve reports against another. It is enforced in the service, not the
UI — bypassing the screen does not help.

### Appeals and impartiality (1 min)

**As `PRK001`** → **Appeals**. One is pending. The driver's reason is there
with the evidence photo.

Note who decided the original: `SEC001`. Had you logged in as `SEC001`, the
system would refuse the review — the reviewer cannot be the decider.

### Access control, shown not claimed (2 min)

**As `STU2201`** → **Find parking**. The faculty lot reads *"Not available to
your role."*

Then show it is not just a hidden button — open the browser console:

```js
await fetch('/api/reservations', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ zoneId: '<faculty lot id>', vehicleId: '<any>',
    startTime: new Date().toISOString(), endTime: new Date(Date.now()+3600000).toISOString() })
}).then(r => r.json())
```

→ `Your role is not eligible to book Faculty Lot — Shared.`

**As `SEC002`** → the guard is scoped to two zones, so their zone dropdowns
only ever offer those two.

### Booking and the no-show release (1 min)

**As `FAC101`** → **Find parking** → book a slot. A live countdown appears:
*"Check in within 9:12 or the slot is released."* Check in, and the card
becomes *"You are parked."*

Say what happens if they never arrive: the hold lapses and the slot returns to
the pool automatically, with no scheduled job involved.

### Gate operations (1 min)

**As `SEC002`** → **Check a pass** → enter `DEMO24AB`.

Green: *Let them in*, with the plate large because that is what the guard
compares against the car in front of them. Scan it a second time — it reports
*"already checked in"* rather than refusing, because a visitor leaving and
returning is normal.

Then **Unknown vehicles**: `KA51CO7788` is flagged **seen 3×**. One courier is
noise; the same courier every day is a conversation with facilities.

### Analytics and audit (1 min)

**As `PRK001`** → **Analytics**: 5 violations, 67% upheld, a repeat offender,
average response time.

Then **Audit log** — around 6 parking entries, with a banner saying sign-ins
are not shown.

**Now as `ADM001`** → the same page shows everything, including `auth.*` and
`authz.denied`. Explain the split: the full log is a behavioural record of
staff, and auditing parking decisions does not require seeing who failed to
log in last night.

That contrast is the strongest single moment in the demo — the same screen,
two roles, visibly different data.

---

## 4. Deploying it for real

The step that decides whether a pilot happens is **data**, not code.

**As `PRK001`** → **Import**. Four tabs, numbered in dependency order. Hit
**Load a sample** on *People*, then **Preview** — nothing is written yet.

Now paste a broken row and preview again. You get spreadsheet row numbers, the
offending column, and a plain description. **Nothing imports while any row is
bad**, because a half-imported roster cannot be told from a complete one.

---

## 5. What not to demo

Two integrations are written but have **never run against their real
services**, because no credentials exist:

- **Google Workspace SSO** — the button stays hidden until
  `GOOGLE_CLIENT_ID` is set, so it will not appear by accident.
- **Plate Recognizer OCR** — `OCR_PROVIDER=none` by default. Plates are typed.

If asked, the honest answer is that both are built and off, and each needs one
credential plus a round of testing.

Also absent **by design**, not oversight — worth saying before someone asks:

- **No fines.** Levying money needs legal authority and a finance owner. The
  penalty is a record.
- **No SMS or voice.** Needs TRAI DLT registration, a multi-week dependency on
  the site's paperwork.
- **No automatic parking sessions or live occupancy.** A geofence detects the
  phone, not the car. The honest version is check-in; the real fix is an ANPR
  camera at the gate.

See [DESIGN.md](./DESIGN.md) §3 and §5.

---

## Troubleshooting

**Everything 500s, or login says the ID is not recognised.**
The database is not running. `npx prisma dev` does not survive a reboot:

```bash
npx prisma dev --name parqel --detach
```

**A page 404s that plainly exists.**
Stale Turbopack route manifest, usually after a schema change. Stop the dev
server and:

```bash
rm -rf .next
```

**Migrations fail with "type ... already exists".**
`DATABASE_URL` is pointing at `template1`. Postgres clones that into every new
database — including Prisma's shadow database. Re-run
`npx tsx scripts/bootstrap-db.ts` and use the URLs it prints. Both
`DATABASE_URL` **and** `SHADOW_DATABASE_URL` are required.

**A booking fails with "That zone no longer exists."**
The page was loaded before the last reseed and is holding old IDs. Refresh.

**Demo data drifted mid-rehearsal.**

```bash
npm run db:demo
```

---

## Checking it yourself

```bash
npm test
```

51 tests. They cover the permission matrix, zone scoping, role validity
windows, all four integrity rules, the audit visibility boundary, booking
eligibility, and CSV normalisation.

```bash
npm run typecheck
```

```bash
npm run build
```

```bash
npm run audit:tail
```

Prints the recent audit trail — useful for showing that every action in the
demo left a record attributed to whoever performed it.

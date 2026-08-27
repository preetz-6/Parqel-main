# Parqel — design

Closed-campus parking accountability for a single organisation (a college or
an IT company). This document records *why* the system is shaped the way it
is. The code says what it does; this says what it refuses to do and what it
cost to decide that.

---

## 1. The problem

People park badly in shared lots — blocking others, taking assigned slots,
obstructing fire lanes. There is no accountability because there is no
reliable way to reach the owner of a specific vehicle, and no record that
survives the argument in the car park.

**The hypothesis v1 exists to test:** in a closed lot, notifying an
identified owner changes parking behaviour.

Everything in v1 serves that question. If the answer is no, nothing in the
later phases matters.

---

## 2. What this used to be, and why it changed

The repository began as a public consumer app: scan any stranger's plate,
look them up, notify them. That version is preserved on the first commit
(`Baseline: original Parqel consumer prototype`). It could not have worked,
for four structural reasons — all four are dissolved by the closed-campus
model, and the current design exists to keep them dissolved.

| Blocker in the consumer version | Why it was fatal | How the pivot removes it |
|---|---|---|
| **Plate → owner lookup** | Owner data is not available to a consumer app. India's Bulk Data Sharing Policy, the route by which private companies bought VAHAN owner data, was withdrawn in 2020 over privacy concerns. The old scanner literally narrated "Matching RTO database…" for something that cannot be built. | The org's own roster **is** the registry. `Vehicle.userId` comes from an admin import, not from any government system. |
| **Two-sided cold start** | The alert only lands if the offending driver already has the app. Not "enough users in the city" — *this specific stranger, right now*. Hit rate at launch is effectively zero, and three alerts vanishing into nothing ends that user. | A closed community where an admin onboards everyone. Both sides are present by construction. |
| **Unverified plate ownership** | Anyone could claim any plate and receive that vehicle's alerts. Worse, the original write logic (`if (!userSnap.exists())`) meant the first claimant kept the record permanently — the real owner would sign up and their alerts would silently route to the squatter, forever. | Vehicles are imported or admin-approved. `assertPlateUnclaimed` refuses a plate already held by another user; a transfer needs a human. |
| **No evidence** | A report was a plate plus a dropdown. Nothing could distinguish a true report from a false one, so the system was a harassment instrument by construction. | Photo mandatory, GPS-attached, guard triage, supervisor approval. A reporter can never decide their own report. |

The consumer version also published plate + location + reporter name to a
public feed. That is a searchable log of where identifiable vehicles have
been seen — a stalking tool, and processing of non-users' personal data
without consent under the DPDP Act. **There is no public feed in this
design and there should never be one.** Alerts are private between the two
parties.

---

## 3. What is deliberately not in v1

Each of these was considered and cut. They are listed here so nobody
re-adds them by accident, mistaking absence for oversight.

**Fines and payments.** The heaviest item in the original plan, and the
blocker is not technical. Ask who has legal authority to levy money: a
campus can impose penalties only if it is in the code of conduct and the
finance office is actually signed up; an RWA can do so only per its bye-laws
with a general body resolution, and enforceability is genuinely contested.
Then `Fine.paymentId` implies a gateway, merchant account, KYC, settlement,
GST and refunds on successful appeal.

> v1 makes the penalty a **record, not rupees**. Repeat-offender counts and
> an escalating history carry most of the deterrent and need zero
> institutional buy-in. Revisit only with finance sign-off in writing.

**SMS and voice notification.** A2P SMS in India requires TRAI **DLT
registration** — sender ID and every template pre-registered, using the
pilot org's paperwork. That is a multi-week dependency on someone else's
admin office, and it is always discovered the week before launch. Voice
needs verified caller ID on top. The escalation ladder also assumes the
offender has the app with notifications on; a student who ignores a push
will ignore an SMS.

> v1 is push + in-app only. `NotificationChannel` reserves `SMS` and `VOICE`
> so the schema does not change when DLT clears. The real escalation on a
> campus is a guard walking over, not a robocall.

**TrustScore.** A derived score with undefined inputs. It gets built, nobody
can explain the number, and it generates grievances. `count(violations)`
gives most of the value with total transparency.

**PermissionOverride.** The original model had `override_type: org-only |
isolated`, which does not describe a mechanism. It was reaching for
zone-scoped roles — see `UserRole.scopeZoneIds` in [ROLES.md](./ROLES.md).

**Automatic parking sessions, live occupancy, sensors.** See §5.

---

## 4. Zone model

Two-wheelers are in scope for enforcement and out of scope for allocation.
That asymmetry is deliberate: on an Indian campus bikes are 60–80% of
vehicles and they mass-park in a shed at whatever density fits. Modelling
them as discrete numbered slots would be a fiction.

| Zone type | Class | Spots | Booking | Mechanic |
|---|---|---|---|---|
| **Fixed** | Four-wheeler | Numbered | No | Assigned to a user; enforcement only |
| **Shared** | Four-wheeler | Numbered | Yes | Time-boxed hold, 5–10 min buffer, auto-release on no-show |
| **Event** | Mixed | Numbered | Yes | Zone temporarily opened for a program, then reverts |
| **Two-wheeler** | Two-wheeler | **None** | **No** | `ParkingZone.capacity` only |

A two-wheeler zone has **no `ParkingSpot` rows at all**. The importer
refuses to create them (`"…is a two-wheeler zone. Those track capacity only
and cannot have numbered spots."`). But two-wheelers are ordinary rows in
`Vehicle`, so OCR matching, violations and owner alerts work identically.

Fixed slots need enforcement, not booking — the problem there is someone
else parking in your spot, not allocation. Reservations are valid only on
`SHARED` and `EVENT` zones.

An `Event` may open a **fixed** zone (a convocation taking over staff
parking). Displaced assignees must be notified — that is precisely the
situation that generates angry reports.

**`SlotAssignment` is dated** (`startDate`/`endDate`) rather than a column on
`ParkingSpot`. Campus allocation rotates every academic year, and a
violation reported in March must resolve against whoever held that slot *in
March*.

---

## 5. Geofencing: prompt, never truth

The question was whether a campus geofence could detect vehicle entry and
exit. The answer is no, for one disqualifying reason and several practical
ones.

**A geofence detects the phone, not the vehicle.** Someone carpools, takes
the bus, is dropped off, or leaves their car overnight and returns by metro
— the phone crosses the boundary and the car does not. You would open a
parking session for someone who came by bus, and close one for a car still
parked. For a multi-vehicle user it cannot tell which car they arrived in.

Then the practical problems, worse in India specifically:

- **Background location is a wall.** Android 11+ will not let you request
  `ACCESS_BACKGROUND_LOCATION` in-app at all — the user must go into
  Settings and choose "Allow all the time". iOS re-prompts periodically with
  a map of everywhere they have been.
- **It is an HR problem before it is a technical one.** A workplace app
  asking for continuous background location is among the most-refused
  permissions there is, and DPDP requires a narrow stated purpose.
- **OEM battery killers.** Xiaomi, Oppo, Vivo, OnePlus, Realme — the
  dominant handsets on an Indian campus — aggressively kill background
  registrations. Unfixable from our code.
- **Latency and radius.** 1–3 minute trigger lag, 100–150 m practical
  minimum. A campus-wide fence cannot distinguish driving in from walking in
  through the pedestrian gate.

**Where it is safe** — every case where a miss is harmless:

| Use | Why safe |
|---|---|
| Entry nudge: *"Parking on campus? Tap to check in"* | Human confirms; manual check-in still works if it misses |
| Exit nudge: *"Looks like you left — end your session?"* | Prevents hanging sessions without depending on the fence |
| **Reservation auto-release** | Combined with the `holdUntil` timer; a false negative just frees a slot early |
| Event broadcast | Pure convenience |

**The real answer for entry/exit is an ANPR camera at the vehicular gate.**
Plate Recognizer (already the chosen OCR) has a stream option built for it,
a campus typically has one or two controlled vehicle gates, and it reuses
the OCR spend rather than adding a dependency. For an IT company, ask
facilities first — their security team almost certainly already logs vehicle
entry, and integrating may be far less work than any of this.

**Consequence for the schema:** there is no `ParkingSession` model.
`CheckIn` is the honest v1 stand-in — self-reported, `method` is one of
`MANUAL | QR | GEOFENCE_PROMPT`, and `GEOFENCE_PROMPT` means *the geofence
suggested it and a human confirmed*. Live occupancy and overstay alerts are
deferred until a capture mechanism exists, because a manual-checkout model
drifts to 100% occupied within a week and silently poisons Find My Vehicle,
duration analytics and overstay alerts all at once.

---

## 6. Phases

**Phase A — foundation. ✅ Complete.**
Schema, RBAC, audit trail, auth, admin shell, CSV import.

CSV import is in Phase A on purpose. Someone has to enter every user,
vehicle, zone and spot before a pilot runs; for a few hundred vehicles that
is a day of tedious work, and it is the step that actually stalls
deployments.

**Phase B — the core loop. ← next, and this is the pilot.**
Employee: my slot, my vehicles, check-in, find my vehicle. Report a
violation with photo and manual plate entry. Guard triage → supervisor
approval. FCM push + in-app alert to the owner. Violation history and
appeal.

Ship Phase B and measure before building anything below it.

**Phase C — gate operations. ✅ Complete.**
Visitor passes (issue, gate scan, revoke), unknown-vehicle log, emergency
alerts and guard dispatch.

Three decisions worth keeping:

- **A second scan is reported, not refused.** A visitor leaving and re-entering
  is normal. The guard is told "already checked in at 09:14" and uses their
  judgement, rather than having a door slammed on a legitimate guest.
- **Unknown vehicles are checked against the registry first.** A typo at the
  gate should not turn a registered vehicle into an "unknown" one, so the
  logger is told when the plate is actually registered and pointed at the
  violation flow instead.
- **Emergency alerts bypass triage entirely.** A blocked fire lane cannot wait
  for a supervisor's decision. The alert closes automatically when its last
  dispatch resolves.

**Phase D — allocation. ✅ Complete.**
Shared and event booking, `holdUntil` auto-release, event creation with
displaced-assignee notification, and zone entitlements.

Decisions worth keeping:

- **No-shows are swept lazily, not by a cron.** A stale hold only matters at
  the moment somebody asks what is free, so `releaseExpiredHolds()` runs at the
  top of every availability read. No worker, no scheduler, nothing to forget to
  deploy — and the answer is always current.
- **One live booking per person.** Hoarding slots is the failure mode that
  makes a shared pool useless.
- **A spot is chosen inside the booking transaction**, so two people booking
  the last slot at once cannot both win.
- **An event may override a FIXED zone**, and every displaced slot holder is
  notified. That notification is the reason overriding is permitted at all —
  arriving to find your assigned bay taken is exactly the grievance this system
  exists to reduce.

**Phase E — assist. ✅ Complete.**
Plate Recognizer OCR, analytics, audit log viewer.

- **OCR is off by default** (`OCR_PROVIDER=none`) and a pilot runs fine without
  it on typed plates alone. When enabled it fills a *suggestion*; every failure
  path returns null so an unreachable vendor can never stop a report being
  filed, and `matchedVehicleId` is still only ever set by a human.
- **Triage searches the registry from both the typed plate and the OCR
  reading.** When they disagree the mismatch is flagged, because that is the
  case most likely to send an alert to the wrong person.
- **Analytics report only what the data supports.** Durations come from closed
  check-ins alone — an open one has no end and averaging it in would quietly
  understate everything. There is no revenue metric because v1 issues no fines.
- **The audit viewer implements the `audit:read` split.** A Parking Admin sees
  parking actions; sign-ins, denied authorization attempts and role changes
  need `audit:read`. That is not caution for its own sake: the full log is a
  behavioural record of staff, and auditing parking decisions does not require
  seeing who failed to log in last night.

**Deferred beyond v1.** Fines and payments (finance sign-off required),
trust score, sensors, SMS/voice (DLT), ANPR at the gate.

---

## 7. OCR

The design detail that makes OCR viable here: **do not read arbitrary
plates, pick from a known list.**

Run Plate Recognizer server-side, then fuzzy-match the result against the
`Vehicle` table — a few hundred rows — and show the reviewer *"read
`KA05MN1234`, closest registered plate `KA05MN1284`, confidence 0.82"*. That
turns a hard vision problem into a one-tap confirmation. Indian plates are
famously non-standard (stylised fonts, mud, tinted covers, two-line layouts,
HSRP vs old), so raw OCR accuracy from a phone at an angle at night is much
lower than vendor demos suggest.

`Violation` keeps `plateEntered` (what a human typed) separate from
`ocrPlate` + `ocrConfidence` (what the machine read). `matchedVehicleId` is
only set after a human confirms. **Never accept a client-supplied plate
string as authoritative.**

Implemented in `src/server/violations/ocr.ts`, disabled unless
`OCR_PROVIDER=platerecognizer` and a token is set. **The HTTP call follows
Plate Recognizer's documented API but has never run against the live service**
— there is no token yet. Treat it as unverified until someone points it at a
real key, the same caveat as Google SSO.

---

## 8. Stack notes

Next.js 16 · React 19 · TypeScript · Prisma 7 · PostgreSQL · Tailwind 4.

Both Next 16 and Prisma 7 differ from what most training data and most
tutorials describe. These cost real debugging time:

- **`middleware` is now `proxy`.** File is `src/proxy.ts`, named export
  `proxy`, **nodejs runtime only** (no edge). Next's own docs are explicit
  that it "should not be used as a full session management or authorization
  solution" — so `src/proxy.ts` only bounces requests with no session cookie
  and verifies nothing. Every real check is in the Data Access Layer next to
  the data (`src/server/dal.ts`).
- **All request APIs are async.** `cookies()`, `headers()`, `params`,
  `searchParams`. Synchronous access was removed, not deprecated.
- **`PageProps<'/route'>` / `RouteContext<'/route'>`** are globals generated
  by `next typegen` (also run by `next dev` / `next build`). A cold
  `tsc --noEmit` on a fresh clone fails until typegen has run once.
- **Prisma 7 requires a driver adapter** for SQL providers — there is no
  bundled engine binary. Hence `@prisma/adapter-pg`.
- **Prisma config moved to `prisma.config.ts`** and `.env` is no longer
  loaded automatically (`import "dotenv/config"`). The generator is
  `prisma-client` (not `prisma-client-js`) with a required `output`, and it
  emits split entrypoints: `client`, `models`, `enums`, `browser`.

**The local database needs two URLs, and the obvious one is wrong.**
`npx prisma dev` prints a URL pointing at `template1`. Do not use it. Postgres
clones `template1` into every new database, so schema created there leaks
everywhere — including the shadow database Prisma builds to plan migrations,
which then fails with *"type UserType already exists"*. Worse, that server
serves a single logical database and ignores the database name entirely, so it
cannot host a shadow database at all. Run `scripts/bootstrap-db.ts`, which
creates a real database and probes for the server's separate shadow instance
(the next port up from the database port), then set both `DATABASE_URL` and
`SHADOW_DATABASE_URL`.

**A stale `.next` can 404 routes that exist.** After regenerating the Prisma
client and changing the schema, Turbopack's route manifest went out of sync and
`/api/auth/otp/*` returned Next's HTML 404 page while `/api/auth/logout` kept
working. The code was fine; `rm -rf .next` fixed it. Worth remembering before
debugging a route that is plainly on disk.

**The cookie trap, because it fails silently.** In a Route Handler, mutating
the async `cookies()` store does **not** merge into a `NextResponse` you
construct yourself. The handler returns `200 OK` and the browser receives no
cookie — the only symptom was a missing `GET /` in the server log. Route
Handlers must set cookies on the response object:

```ts
const response = NextResponse.json({ ok: true })
response.cookies.set(await buildSessionCookie(payload))
return response
```

`createSession()` (which uses the `cookies()` store) is for Server Actions
and Server Components only. See `src/server/session.ts`.

---

## 9. Security posture

- **No self-registration, on either auth path.** Google SSO proves who you
  are to Google; it does not create an account. A verified account absent
  from the roster is refused and logged. This is the property that keeps
  plate-to-owner mapping trustworthy — do not relax it for convenience.
- **The employee ID is not a secret.** It is printed on an ID card and is
  often sequential. It identifies; the OTP to the roster-registered phone
  authenticates. Codes are never sent to a number supplied in the request.
- **OTP rate limiting is not optional.** Unthrottled phone auth is a known
  SMS toll-fraud target. 3 requests / 15 min, 5 attempts, single use,
  HMAC-hashed and bound to the employee ID so a code issued for one user can
  never validate for another.
- **The roster is not a probing oracle.** Unknown employee and deactivated
  account return an identical message; the distinction lives in the audit
  log.
- **Deactivation is immediate.** `getActor()` re-checks `status` on every
  request, so access ends on the next request rather than at token expiry.
- **Nothing is hard-deleted.** Violations are voided with a written reason.
  Every mutation and its `AuditLog` row commit in the same transaction, so a
  committed change cannot lack an audit entry. Contact details are redacted
  from the log — an audit trail should not become a second copy of the
  roster's personal data.

---

## 10. Open questions

- **Guard scoping** — do guards work fixed zones, or does one person cover
  everything? If the latter, `scopeZoneIds` stays empty and that is fine.
- **Appeal reviewer** — with a single Parking Admin, integrity rule 2 forces
  appeals up to an Admin. Confirm that is acceptable or name a second
  reviewer.
- **Google SSO is unverified against real Google.** The code path is
  complete but has never run with real credentials. Needs an OAuth client
  from the pilot org before it is trusted.

Settled since:

- **Visitor pass quota** — 5 per rolling 7 days for plain employees, via
  `VISITOR_PASS_WEEKLY_QUOTA`. Guards and above are unlimited, since issuing
  passes is their job. Pick a different number if the pilot site disagrees;
  the point is that it is neither unlimited nor zero.
- **Denied permissions are now audited** as `authz.denied`, with the
  permission and zone, alongside `integrity.blocked` for rule violations.

---

## 11. Running it

```bash
npx prisma dev --name parqel --detach   # local Postgres, no install needed
npm run db:migrate
npm run db:seed
npm run dev
```

Seed users are printed by `db:seed`. `OTP_PROVIDER=console` prints login
codes to the dev-server terminal instead of sending SMS.

```bash
npm test          # 27 tests
npm run typecheck
npm run audit:tail
```

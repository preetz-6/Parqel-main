# Roles, permissions and integrity rules

Authoritative source: `src/server/permissions.ts` (matrix and scoping) and
`src/server/rules.ts` (integrity rules). This document explains the shape and
the reasoning; the code is what executes.

---

## 1. Two concepts, kept separate

> **Permissions** answer *may this person perform this action*.
> **Entitlements** answer *is this person eligible for this resource*.

Conflating them is what produces role explosion. "Students cannot book Zone
A" is an entitlement rule on `user_type` × `zone` — **not** a new role.
Without this split you end up with `StudentTwoWheeler`,
`FacultyFourWheeler`, `ContractStaffVisitor` and a matrix nobody can reason
about.

This is why students are not a role. They perform the same *actions* as any
employee; what differs is which zones they are eligible for.

Entitlements live in the `ZoneEntitlement` table and `src/server/entitlements.ts`:

```
ZoneEntitlement(zoneId, userType)
```

**A zone with no entitlement rows is open to everyone.** Absent means
unconstrained — the same default as zone-scoped permissions, so a newly created
zone is usable immediately and gets locked down deliberately. Note that an
*empty* list is not the same as no rows: no rows means open to all, whereas a
zone whose only entitlements were removed one by one would end up open to
nobody. `bookability.test.ts` pins both cases.

---

## 2. The five roles

| Role | Who | Purpose |
|---|---|---|
| `EMPLOYEE` | Staff, faculty, students | Park, book shared/event slots, report violations, appeal, host visitors |
| `GUARD` | Gate and patrol security | Triage reports, scan passes, log unknown vehicles, respond to dispatch |
| `SUPERVISOR` | Security head / shift in-charge | Approve violations, dispatch guards, oversee the queue |
| `PARKING_ADMIN` | Facilities / admin office | Zones, spots, slot allocation, events, vehicle approvals, appeals |
| `ADMIN` | IT | Users, roles, integrations, settings, full audit log |

**Visitors are not a role and get no account.** They hold a time-bound QR
`VisitorPass` issued by a host or a guard. Keeping them out of the identity
model is deliberate — a visitor is a pass, not a user.

An `Auditor` read-only role was considered and dropped; `PARKING_ADMIN`
(parking-scoped audit) and `ADMIN` (full audit) cover it.

---

## 3. Scope: permissions are (role × scope)

```prisma
UserRole(userId, role, scopeZoneIds[], validFrom, validTo)
```

- **`scopeZoneIds` empty** → the role applies org-wide.
- **`scopeZoneIds` populated** → *every* permission that role grants is
  usable only against a zone in that list.

That single uniform rule is what lets one guard cover Block A and another
cover the basement without inventing a role per zone. It is also the
concrete answer to what the original `PermissionOverride` entity was
reaching for.

`validFrom` / `validTo` bound the role in time, which covers shift-limited
guards and temporary elevation ("cover for the supervisor this week") with
an automatic expiry rather than a cleanup task nobody runs.

### Not every permission is a per-zone act

`ZONE_SCOPED_PERMISSIONS` in `permissions.ts` lists the permissions for which
scope is meaningful. Anything absent from that set ignores `scopeZoneIds`
entirely.

This distinction was missing at first and it broke real workflows: a guard
scoped to Block A was **locked out of the gate scan screen**, because
`pass:scan` was being filtered by a zone that has nothing to do with checking
a visitor pass at the barrier. Triaging a report in Block A is a per-zone act;
checking a pass, reading your own dispatch list, and filing an appeal are not.

Adding a permission to the set makes it stricter, never looser, so the safe
default for a new permission is to leave it out and add it deliberately.

### Fail closed

For permissions that *are* zone-scoped:

```ts
// A scoped role with no zoneId supplied is DENIED, not allowed.
can(scopedGuard, 'violation:triage')                    // false
can(scopedGuard, 'violation:triage', { zoneId: 'A' })   // true
can(scopedGuard, 'violation:triage', { zoneId: 'B' })   // false

// Not a per-zone act, so scope does not apply:
can(scopedGuard, 'pass:scan')                           // true
```

Forgetting to pass the zone must deny. A call site that omits `zoneId` is a
bug, and the safe failure for a bug is refusal. Covered by tests in
`permissions.test.ts`.

### `holdsPermission` — for visibility gates, never for authorization

```ts
holdsPermission(actor, 'violation:triage')   // ignores scope entirely
```

Two legitimate uses, both of which cost you correctness if you reach for
`can()` instead:

1. **UI visibility.** "Should this person see the security queue at all?" A
   scoped guard would fail `can(actor, 'violation:triage')` with no zone and
   be shown nothing — the per-violation zone check happens when they open one.
2. **Cheap refusal before expensive work.** Route handlers that parse an 8 MB
   multipart upload call it first, so an unauthorized caller is refused before
   the server reads the body.

It is **never sufficient on its own.** Every service still performs the
zone-aware `can()` / `assertCan()` check before mutating anything.

---

## 4. The matrix

`✓` full · `own` own records only · `req` request, needs approval ·
`scope` limited to assigned zones · `—` none

| Capability | Emp | Guard | Sup | P.Admin | Admin |
|---|:--:|:--:|:--:|:--:|:--:|
| View own profile / vehicles | ✓ | ✓ | ✓ | ✓ | ✓ |
| Add a vehicle | req | — | — | ✓ approve | ✓ |
| View any user's vehicles | — | scope | ✓ | ✓ | ✓ |
| View zone map & availability | ✓ | ✓ | ✓ | ✓ | ✓ |
| View my assigned slot | ✓ | — | — | — | — |
| Check in / find my vehicle | own | — | — | — | — |
| Book shared / event slot | ✓ | on behalf | ✓ | ✓ | — |
| Cancel reservation | own | — | ✓ | ✓ | — |
| Force-release a slot | — | — | ✓ | ✓ | — |
| Report a violation | ✓ | ✓ | ✓ | ✓ | — |
| View reports I filed | own | own | ✓ | ✓ | ✓ |
| View violations against me | own | own | ✓ | ✓ | ✓ |
| Triage / verify a report | — | scope | ✓ | ✓ | — |
| Confirm OCR plate match | — | propose | ✓ | ✓ | — |
| Approve / reject violation | — | — | ✓ | ✓ | — |
| Void violation (reason logged) | — | — | — | ✓ | — |
| **Hard-delete a violation** | — | — | — | — | — |
| File appeal on own violation | ✓ | ✓ | ✓ | ✓ | — |
| Review / decide appeal | — | — | — | ✓ | ✓ |
| Issue visitor pass | ✓ quota | ✓ | ✓ | ✓ | — |
| Scan / validate pass | — | ✓ | ✓ | ✓ | — |
| Revoke pass | own | own | ✓ | ✓ | — |
| Log unknown vehicle | — | ✓ | ✓ | ✓ | — |
| Receive & acknowledge alerts | ✓ | ✓ | ✓ | ✓ | ✓ |
| Raise emergency alert | ✓ | ✓ | ✓ | ✓ | — |
| View dispatch queue | — | scope | ✓ | ✓ | — |
| Dispatch a guard | — | — | ✓ | ✓ | — |
| Create / edit zones & spots | — | — | — | ✓ | ✓ |
| Assign fixed slots | — | — | — | ✓ | — |
| Create event / open temp parking | — | — | ✓ | ✓ | — |
| Bulk CSV import | — | — | — | ✓ | ✓ |
| Create / deactivate users | — | — | — | — | ✓ |
| **Assign roles** | — | — | — | — | **✓** |
| View analytics | own | scope | ✓ | ✓ | ✓ |
| View audit log | — | — | — | parking only¹ | ✓ |
| Org settings & integrations | — | — | — | — | ✓ |

¹ `audit:read:parking` shows actions on vehicles, violations, zones,
reservations, passes and imports. `audit:read` additionally shows sign-ins,
denied authorization attempts and role changes. The full log is a behavioural
record of staff — who tried to sign in, from where, and who was refused what —
and auditing parking decisions does not require it. Enforced by
`isParkingAction()` in `audit-visibility.ts`, which fails closed on any action
whose prefix is not explicitly listed.

### There is no wildcard

Not even for `ADMIN`. Every role lists its permissions explicitly, so
widening a role is always a visible diff in review. A wildcard is a
permission grant nobody reads.

Note the deliberate split at the bottom: **`PARKING_ADMIN` allocates slots
but cannot manage users; `ADMIN` manages users but cannot allocate slots.**
Neither can do the other's job, and only `ADMIN` grants roles.

---

## 5. Integrity rules

Holding a permission is not the same as being allowed to use it *in this
particular case*. These four rules outrank the matrix and live in
`src/server/rules.ts`.

### Rule 1 — a reporter can never triage or decide their own report

```ts
assertNotSelfDecided(actor, violation)
```

**This is the rule that makes the system safe to deploy in a workplace.**
Without it, one colleague can file and self-approve reports against another.
That is exactly the harassment vector that sinks community-reporting apps,
and it is the single most important line in the codebase.

### Rule 2 — the appeal reviewer must not be the decider

```ts
assertImpartialAppealReviewer(actor, violation)
```

An appeal reviewed by the person who made the original decision is not an
appeal. Also blocks the reporter from reviewing.

With one Parking Admin this forces the appeal up to an `ADMIN`. **That is
the intended behaviour, not an edge case to design around.**

### Rule 3 — only ADMIN assigns roles, and nobody edits their own

```ts
assertMayAssignRoles(actor)
assertNotSelfRoleChange(actor, targetUserId)
```

The matrix already withholds `role:assign` from `PARKING_ADMIN`; the
assertion is belt-and-braces at the mutation site so a future widening of
the matrix cannot silently hand out privilege escalation. The self-change
ban stops a lone admin quietly self-elevating without a second party in the
audit trail.

### Rule 4 — violations are voided, never deleted

```ts
assertVoidNotDelete(reason)   // demands ≥10 characters
```

The record stays; the reason becomes part of the audit trail. No role in the
matrix holds a delete permission for violations.

### Supporting rule — a plate is claimed once

```ts
assertPlateUnclaimed(existing, requestingUserId)
```

Silently re-pointing a plate to a new owner would reroute that vehicle's
alerts to the wrong person — the exact defect found in the original
prototype. A transfer requires an admin. The CSV importer enforces the same
rule at scale and refuses the whole file.

---

## 6. Where enforcement lives

```
proxy.ts        →  bounces requests with no session cookie. Verifies nothing.
dal.ts          →  authorize(permission, { zoneId }) — the real check.
rules.ts        →  case-specific integrity assertions at the mutation site.
audit.ts        →  audited() writes the change and its log row in one transaction.
```

Per Next.js 16's own guidance, `proxy.ts` performs **no authorization**.
Treat any request that gets past it as entirely unauthenticated.

The pattern for a protected route handler:

```ts
try {
  const actor = await authorize('violation:decide', { zoneId })
  assertNotSelfDecided(actor, violation)

  await audited(ctx, (tx) => tx.violation.update(...), (v) => ({
    action: 'violation.approve', entity: 'Violation', entityId: v.id,
  }))
} catch (error) {
  return toErrorResponse(error)
}
```

`toErrorResponse` maps `ForbiddenError` → bare 403 (naming the missing
permission is a hint nobody needs) and `IntegrityError` → 422 **with its
message**, because those messages are written to be read by the person who
hit them.

---

## 7. Verifying a change

`permissions.test.ts` covers the matrix, zone scoping, validity windows and
all four integrity rules.

```bash
npm test
```

**If you change the matrix, change the tests in the same commit.** The tests
are the specification; the table above is documentation and will drift.

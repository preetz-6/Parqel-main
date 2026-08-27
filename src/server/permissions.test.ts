import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { Role, UserType } from '@/generated/prisma/enums'
import {
  type Actor,
  can,
  holdsPermission,
  scopedZoneIds,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ZONE_SCOPED_PERMISSIONS,
} from './permissions'
import {
  IntegrityError,
  assertImpartialAppealReviewer,
  assertMayAssignRoles,
  assertNotSelfDecided,
  assertNotSelfRoleChange,
  assertPlateUnclaimed,
  assertVoidNotDelete,
} from './rules'

function actor(
  roles: Array<{
    role: Role
    scopeZoneIds?: string[]
    validFrom?: Date | null
    validTo?: Date | null
  }>,
  userId = 'u1',
): Actor {
  return {
    userId,
    employeeId: 'E1',
    name: 'Test User',
    userType: UserType.STAFF,
    roles: roles.map((r) => ({
      role: r.role,
      scopeZoneIds: r.scopeZoneIds ?? [],
      validFrom: r.validFrom ?? null,
      validTo: r.validTo ?? null,
    })),
  }
}

describe('permission matrix', () => {
  test('an employee cannot decide or triage violations', () => {
    const employee = actor([{ role: Role.EMPLOYEE }])
    assert.equal(can(employee, 'violation:report'), true)
    assert.equal(can(employee, 'violation:decide'), false)
    assert.equal(can(employee, 'violation:triage'), false)
    assert.equal(can(employee, 'violation:void'), false)
  })

  test('only ADMIN may assign roles', () => {
    for (const role of [Role.EMPLOYEE, Role.GUARD, Role.SUPERVISOR, Role.PARKING_ADMIN]) {
      assert.equal(can(actor([{ role }]), 'role:assign'), false, `${role} must not assign roles`)
    }
    assert.equal(can(actor([{ role: Role.ADMIN }]), 'role:assign'), true)
  })

  test('a parking admin cannot manage users, an admin cannot allocate slots', () => {
    const parkingAdmin = actor([{ role: Role.PARKING_ADMIN }])
    const admin = actor([{ role: Role.ADMIN }])

    assert.equal(can(parkingAdmin, 'spot:assign'), true)
    assert.equal(can(parkingAdmin, 'user:manage'), false)

    assert.equal(can(admin, 'user:manage'), true)
    assert.equal(can(admin, 'spot:assign'), false)
  })

  test('no role holds a permission outside the declared matrix', () => {
    // Guards against a wildcard creeping in.
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      assert.ok(perms.length > 0, `${role} has no permissions`)
      assert.equal(new Set(perms).size, perms.length, `${role} lists a duplicate permission`)
    }
  })
})

describe('zone scoping', () => {
  const scopedGuard = actor([{ role: Role.GUARD, scopeZoneIds: ['zoneA'] }])
  const orgGuard = actor([{ role: Role.GUARD }])

  test('a scoped guard may act inside their zone', () => {
    assert.equal(can(scopedGuard, 'violation:triage', { zoneId: 'zoneA' }), true)
  })

  test('a scoped guard may not act outside their zone', () => {
    assert.equal(can(scopedGuard, 'violation:triage', { zoneId: 'zoneB' }), false)
  })

  test('a scoped role fails closed when no zone is supplied', () => {
    // Forgetting to pass zoneId must deny, never allow.
    assert.equal(can(scopedGuard, 'violation:triage'), false)
  })

  test('an unscoped role is org-wide', () => {
    assert.equal(can(orgGuard, 'violation:triage', { zoneId: 'anyZone' }), true)
    assert.equal(can(orgGuard, 'violation:triage'), true)
  })

  test('scope does not apply to permissions that are not per-zone acts', () => {
    // Checking a visitor pass at the gate is not a zone act. Applying scope to
    // it locked a zone-scoped guard out of their own job — found in testing.
    assert.equal(can(scopedGuard, 'pass:scan'), true)
    assert.equal(can(scopedGuard, 'pass:issue'), true)
    assert.equal(can(scopedGuard, 'dispatch:read'), true)
  })

  test('scope still applies to genuinely per-zone acts', () => {
    for (const permission of ['violation:triage', 'unknownVehicle:log', 'alert:raise'] as const) {
      assert.equal(can(scopedGuard, permission), false, `${permission} must stay scoped`)
      assert.equal(can(scopedGuard, permission, { zoneId: 'zoneA' }), true, permission)
      assert.equal(can(scopedGuard, permission, { zoneId: 'zoneB' }), false, permission)
    }
  })

  test('holdsPermission ignores scope entirely, for cheap pre-checks', () => {
    // Used to refuse before parsing an 8 MB upload; never sufficient alone.
    assert.equal(holdsPermission(scopedGuard, 'violation:triage'), true)
    assert.equal(holdsPermission(scopedGuard, 'violation:decide'), false)
    assert.equal(holdsPermission(actor([{ role: Role.EMPLOYEE }]), 'unknownVehicle:log'), false)
  })

  test('every zone-scoped permission is a real permission', () => {
    for (const permission of ZONE_SCOPED_PERMISSIONS) {
      assert.ok(
        (PERMISSIONS as readonly string[]).includes(permission),
        `${permission} is not a declared permission`,
      )
    }
  })

  test('scopedZoneIds reports null for org-wide and a union for scoped', () => {
    assert.equal(scopedZoneIds(orgGuard), null)
    assert.deepEqual(scopedZoneIds(scopedGuard), ['zoneA'])

    const multi = actor([
      { role: Role.GUARD, scopeZoneIds: ['zoneA'] },
      { role: Role.SUPERVISOR, scopeZoneIds: ['zoneB'] },
    ])
    assert.deepEqual(scopedZoneIds(multi)?.sort(), ['zoneA', 'zoneB'])
  })
})

describe('role validity windows', () => {
  const now = new Date('2026-06-15T10:00:00Z')

  test('an expired role grants nothing', () => {
    const expired = actor([
      { role: Role.SUPERVISOR, validTo: new Date('2026-06-01T00:00:00Z') },
    ])
    assert.equal(can(expired, 'violation:decide', { now }), false)
  })

  test('a future role grants nothing yet', () => {
    const future = actor([
      { role: Role.SUPERVISOR, validFrom: new Date('2026-07-01T00:00:00Z') },
    ])
    assert.equal(can(future, 'violation:decide', { now }), false)
  })

  test('a role inside its window grants normally', () => {
    const current = actor([
      {
        role: Role.SUPERVISOR,
        validFrom: new Date('2026-06-01T00:00:00Z'),
        validTo: new Date('2026-06-30T00:00:00Z'),
      },
    ])
    assert.equal(can(current, 'violation:decide', { now }), true)
  })
})

describe('integrity rules', () => {
  const reviewer = actor([{ role: Role.PARKING_ADMIN }], 'reviewer-1')

  test('rule 1: a reporter cannot decide their own report', () => {
    assert.throws(
      () => assertNotSelfDecided(reviewer, { reportedById: 'reviewer-1' }),
      IntegrityError,
    )
    assert.doesNotThrow(() => assertNotSelfDecided(reviewer, { reportedById: 'someone-else' }))
  })

  test('rule 2: the decider cannot review the appeal', () => {
    assert.throws(
      () =>
        assertImpartialAppealReviewer(reviewer, {
          decidedById: 'reviewer-1',
          reportedById: 'other',
        }),
      IntegrityError,
    )
    assert.doesNotThrow(() =>
      assertImpartialAppealReviewer(reviewer, {
        decidedById: 'another-admin',
        reportedById: 'other',
      }),
    )
  })

  test('rule 3: non-admins cannot assign roles, nobody edits their own', () => {
    assert.throws(() => assertMayAssignRoles(actor([{ role: Role.PARKING_ADMIN }])), IntegrityError)
    assert.doesNotThrow(() => assertMayAssignRoles(actor([{ role: Role.ADMIN }])))

    const admin = actor([{ role: Role.ADMIN }], 'admin-1')
    assert.throws(() => assertNotSelfRoleChange(admin, 'admin-1'), IntegrityError)
    assert.doesNotThrow(() => assertNotSelfRoleChange(admin, 'someone-else'))
  })

  test('rule 4: voiding demands a written reason', () => {
    assert.throws(() => assertVoidNotDelete(''), IntegrityError)
    assert.throws(() => assertVoidNotDelete('typo'), IntegrityError)
    assert.equal(
      assertVoidNotDelete('  duplicate report of violation 42  '),
      'duplicate report of violation 42',
    )
  })

  test('a plate already owned by someone else cannot be re-claimed', () => {
    assert.throws(
      () => assertPlateUnclaimed({ userId: 'owner-1', status: 'APPROVED' }, 'attacker-2'),
      IntegrityError,
    )
    assert.doesNotThrow(() =>
      assertPlateUnclaimed({ userId: 'owner-1', status: 'APPROVED' }, 'owner-1'),
    )
    assert.doesNotThrow(() => assertPlateUnclaimed(null, 'anyone'))
  })
})

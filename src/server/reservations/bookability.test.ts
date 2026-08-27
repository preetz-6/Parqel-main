import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  AllocationType,
  UserType,
  VehicleClass,
  ZoneVehicleClass,
} from '@/generated/prisma/enums'
import { bookability, vehicleFitsZone, type BookabilityInput } from './bookability'

function zone(overrides: Partial<BookabilityInput> = {}): BookabilityInput {
  return {
    allocationType: AllocationType.SHARED,
    vehicleClass: ZoneVehicleClass.FOUR_WHEELER,
    entitledUserTypes: null,
    eventActive: false,
    userType: UserType.STAFF,
    ...overrides,
  }
}

describe('bookability', () => {
  test('a shared four-wheeler zone with no entitlements is bookable by anyone', () => {
    for (const userType of Object.values(UserType)) {
      assert.equal(bookability(zone({ userType })).bookable, true, userType)
    }
  })

  test('two-wheeler zones are never bookable', () => {
    // Capacity-only by design — there is no discrete slot to reserve.
    const verdict = bookability(zone({ vehicleClass: ZoneVehicleClass.TWO_WHEELER }))
    assert.equal(verdict.bookable, false)
    assert.match(verdict.bookable === false ? verdict.reason : '', /first come/i)
  })

  test('two-wheeler wins even when an event is running', () => {
    const verdict = bookability(
      zone({ vehicleClass: ZoneVehicleClass.TWO_WHEELER, eventActive: true }),
    )
    assert.equal(verdict.bookable, false)
  })

  test('fixed zones are not bookable, but an event overrides that', () => {
    const closed = bookability(zone({ allocationType: AllocationType.FIXED }))
    assert.equal(closed.bookable, false)
    assert.match(closed.bookable === false ? closed.reason : '', /assigned/i)

    const opened = bookability(
      zone({ allocationType: AllocationType.FIXED, eventActive: true }),
    )
    assert.equal(opened.bookable, true)
  })

  test('event zones are closed outside their event', () => {
    assert.equal(bookability(zone({ allocationType: AllocationType.EVENT })).bookable, false)
    assert.equal(
      bookability(zone({ allocationType: AllocationType.EVENT, eventActive: true })).bookable,
      true,
    )
  })

  test('entitlements restrict by user type, and absent means unrestricted', () => {
    const staffOnly = [UserType.STAFF, UserType.FACULTY]

    assert.equal(
      bookability(zone({ entitledUserTypes: staffOnly, userType: UserType.FACULTY })).bookable,
      true,
    )

    const student = bookability(
      zone({ entitledUserTypes: staffOnly, userType: UserType.STUDENT }),
    )
    assert.equal(student.bookable, false)
    assert.match(student.bookable === false ? student.reason : '', /your role/i)

    // An empty list is not the same as null: null means open to all, [] means
    // open to nobody.
    assert.equal(bookability(zone({ entitledUserTypes: [] })).bookable, false)
    assert.equal(bookability(zone({ entitledUserTypes: null })).bookable, true)
  })

  test('zone type is checked before entitlements', () => {
    // A student looking at a two-wheeler shed should be told it is first come,
    // not that their role is wrong.
    const verdict = bookability(
      zone({
        vehicleClass: ZoneVehicleClass.TWO_WHEELER,
        entitledUserTypes: [UserType.STAFF],
        userType: UserType.STUDENT,
      }),
    )
    assert.equal(verdict.bookable, false)
    assert.match(verdict.bookable === false ? verdict.reason : '', /first come/i)
  })
})

describe('vehicleFitsZone', () => {
  test('mixed zones take anything', () => {
    assert.equal(vehicleFitsZone(VehicleClass.TWO_WHEELER, ZoneVehicleClass.MIXED), true)
    assert.equal(vehicleFitsZone(VehicleClass.FOUR_WHEELER, ZoneVehicleClass.MIXED), true)
  })

  test('otherwise the classes must match', () => {
    assert.equal(
      vehicleFitsZone(VehicleClass.FOUR_WHEELER, ZoneVehicleClass.FOUR_WHEELER),
      true,
    )
    assert.equal(
      vehicleFitsZone(VehicleClass.TWO_WHEELER, ZoneVehicleClass.FOUR_WHEELER),
      false,
    )
    assert.equal(
      vehicleFitsZone(VehicleClass.FOUR_WHEELER, ZoneVehicleClass.TWO_WHEELER),
      false,
    )
  })
})

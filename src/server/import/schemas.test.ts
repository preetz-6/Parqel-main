import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { plateSchema, userRowSchema, vehicleRowSchema, spotRowSchema, zoneRowSchema } from './schemas'

describe('plate normalisation', () => {
  test('strips spaces and hyphens and upper-cases', () => {
    // The same plate is written every one of these ways on a real roster.
    for (const input of ['KA 05 MN 1234', 'ka05mn1234', 'KA-05-MN-1234', ' KA 05MN1234 ']) {
      assert.equal(plateSchema.parse(input), 'KA05MN1234')
    }
  })

  test('rejects something too short to be a plate', () => {
    assert.equal(plateSchema.safeParse('KA').success, false)
  })
})

describe('phone normalisation', () => {
  const base = { employee_id: 'E1', name: 'Test', email: '', user_type: 'staff', department: '' }

  test('accepts common formats and normalises to +91', () => {
    for (const input of ['9876543210', '+919876543210', '98765 43210', '987-654-3210']) {
      const result = userRowSchema.parse({ ...base, phone: input })
      assert.equal(result.phone, '+919876543210')
    }
  })

  test('empty phone becomes null rather than failing', () => {
    // Contractors often have no number on the roster; they sign in via SSO.
    assert.equal(userRowSchema.parse({ ...base, phone: '' }).phone, null)
  })

  test('rejects numbers that are not Indian mobiles', () => {
    for (const bad of ['12345', '1234567890', '+1 555 000 1111']) {
      assert.equal(userRowSchema.safeParse({ ...base, phone: bad }).success, false, bad)
    }
  })
})

describe('enum aliases', () => {
  test('user_type accepts the words people actually type', () => {
    const base = { employee_id: 'E1', name: 'T', email: '', phone: '', department: '' }
    const cases: [string, string][] = [
      ['faculty', 'FACULTY'],
      ['Professor', 'FACULTY'],
      ['teacher', 'FACULTY'],
      ['staff', 'STAFF'],
      ['employee', 'STAFF'],
      ['vendor', 'CONTRACTOR'],
      ['STUDENT', 'STUDENT'],
    ]
    for (const [input, expected] of cases) {
      assert.equal(userRowSchema.parse({ ...base, user_type: input }).user_type, expected, input)
    }
  })

  test('vehicle_class accepts bike/car shorthand', () => {
    const base = { plate_number: 'KA05MN1234', make_model: '', employee_id: 'E1' }
    const cases: [string, string][] = [
      ['two_wheeler', 'TWO_WHEELER'],
      ['bike', 'TWO_WHEELER'],
      ['Scooter', 'TWO_WHEELER'],
      ['2 wheeler', 'TWO_WHEELER'],
      ['car', 'FOUR_WHEELER'],
      ['four-wheeler', 'FOUR_WHEELER'],
    ]
    for (const [input, expected] of cases) {
      assert.equal(
        vehicleRowSchema.parse({ ...base, vehicle_class: input }).vehicle_class,
        expected,
        input,
      )
    }
  })

  test('an unknown enum value reports the allowed set', () => {
    const result = userRowSchema.safeParse({
      employee_id: 'E1',
      name: 'T',
      email: '',
      phone: '',
      department: '',
      user_type: 'alien',
    })
    assert.equal(result.success, false)
    assert.match(result.error!.issues[0]!.message, /must be one of: STAFF, FACULTY/)
  })

  test('spot type defaults to STANDARD and maps accessibility synonyms', () => {
    assert.equal(spotRowSchema.parse({ zone_name: 'Z', code: 'a1' }).type, 'STANDARD')
    assert.equal(
      spotRowSchema.parse({ zone_name: 'Z', code: 'a1', type: 'handicapped' }).type,
      'ACCESSIBLE',
    )
    // Codes are upper-cased so lookups are stable.
    assert.equal(spotRowSchema.parse({ zone_name: 'Z', code: 'a1' }).code, 'A1')
  })

  test('zone capacity is coerced from a string cell', () => {
    const zone = zoneRowSchema.parse({
      name: 'Lot',
      building: '',
      floor: '',
      allocation_type: 'shared',
      vehicle_class: 'both',
      capacity: '25',
    })
    assert.equal(zone.capacity, 25)
    assert.equal(zone.vehicle_class, 'MIXED')
  })
})

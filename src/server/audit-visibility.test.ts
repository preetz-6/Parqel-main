import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { isParkingAction, PARKING_ACTION_PREFIXES } from './audit-visibility'

/**
 * These are the action names actually emitted across the codebase. If a new
 * one is added and forgotten here, the risk is a Parking Admin silently
 * gaining sight of staff sign-in behaviour — so the list is deliberately
 * concrete rather than pattern-based.
 */
const PARKING_ACTIONS = [
  'violation.report',
  'violation.triage',
  'violation.approved',
  'violation.rejected',
  'violation.void',
  'appeal.file',
  'appeal.upheld',
  'appeal.overturned',
  'vehicle.approve',
  'zone.create',
  'reservation.create',
  'reservation.checkIn',
  'reservation.cancel',
  'reservation.forceRelease',
  'event.create',
  'event.displacementNotice',
  'pass.issue',
  'pass.scan',
  'pass.rescan',
  'pass.revoke',
  'unknownVehicle.log',
  'alert.raise',
  'alert.emergency',
  'alert.dispatched',
  'dispatch.assign',
  'dispatch.responding',
  'dispatch.resolved',
  'import.users',
  'import.user.create',
  'import.vehicle.upsert',
]

const RESTRICTED_ACTIONS = [
  'auth.login.otp',
  'auth.login.sso',
  'auth.logout',
  'auth.otp.request',
  'auth.otp.request.unknown_employee',
  'auth.otp.request.rate_limited',
  'auth.otp.verify.too_many_attempts',
  'auth.login.sso.not_on_roster',
  'auth.login.sso.domain_rejected',
  'authz.denied',
  'integrity.blocked',
  'role.assign',
  'user.deactivate',
]

describe('audit visibility', () => {
  test('parking actions match parking action prefixes', () => {
    for (const action of PARKING_ACTIONS) {
      assert.equal(isParkingAction(action), true, `${action} should be visible`)
    }
  })

  test('authentication and authorization actions are not', () => {
    for (const action of RESTRICTED_ACTIONS) {
      assert.equal(isParkingAction(action), false, `${action} must stay restricted`)
    }
  })

  test('an unknown action is restricted by default', () => {
    // Fail closed: a new action stays hidden until someone deliberately adds
    // its prefix, rather than leaking because nobody updated the list.
    assert.equal(isParkingAction('something.new'), false)
    assert.equal(isParkingAction(''), false)
  })

  test('prefixes anchor a namespace rather than matching a substring', () => {
    for (const prefix of PARKING_ACTION_PREFIXES) {
      assert.ok(prefix.endsWith('.'), `${prefix} should end with a dot`)
      assert.equal(isParkingAction(`authz.${prefix}denied`), false, prefix)
    }
  })
})

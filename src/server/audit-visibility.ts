/**
 * Classification of parking-related audit actions.
 *
 * Deliberately free of `server-only` and database imports so it can be tested
 * directly — this provides a clean boundary for categorising actions.
 *
 * Historically used for the scoped Parking Admin role. Consolidated with
 * full audit read (held by Admin) in the 4-role model.
 */

/** Every prefix ends with a dot so it anchors a namespace rather than a substring. */
export const PARKING_ACTION_PREFIXES = [
  'violation.',
  'appeal.',
  'vehicle.',
  'zone.',
  'spot.',
  'reservation.',
  'event.',
  'pass.',
  'unknownVehicle.',
  'alert.',
  'dispatch.',
  'import.',
] as const

/** Fails closed: an action with no matching prefix stays restricted. */
export function isParkingAction(action: string): boolean {
  return PARKING_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix))
}

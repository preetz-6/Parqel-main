/**
 * Which audit actions a `audit:read:parking` holder may see.
 *
 * Deliberately free of `server-only` and database imports so it can be tested
 * directly — this is a security boundary, and the query in `audit-query.ts` is
 * built from the same prefix list so a test here covers what actually runs.
 *
 * The split matters: the full log records who tried to sign in, from which
 * address, and who was refused access to what. That is a behavioural record of
 * staff. A Parking Admin needs to audit parking decisions; they do not need to
 * see that a colleague failed to log in four times last night.
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

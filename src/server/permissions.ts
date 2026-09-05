import { Role, type UserType } from '@/generated/prisma/enums'

/**
 * Permissions are (role × scope), not role alone.
 *
 * A UserRole carries `scopeZoneIds`. If that array is empty the role applies
 * org-wide; if it is populated, every permission that role grants is only
 * usable against a zone in that list. That single rule is what lets one guard
 * cover Block A while another covers the basement, without inventing a role
 * per zone.
 *
 * Entitlements — which zones a user may *book* — are a separate concern and
 * live in `entitlements.ts`. Do not conflate them: permissions answer "may
 * this person perform this action", entitlements answer "is this person
 * eligible for this resource".
 */

export const PERMISSIONS = [
  // profile & vehicles
  'vehicle:request',
  'vehicle:approve',
  'vehicle:read:any',

  // places
  'zone:read',
  'zone:write',
  'spot:assign',

  // booking (shared and event zones only)
  'reservation:create',
  'reservation:create:onBehalf',
  'reservation:cancel:any',
  'reservation:forceRelease',

  // enforcement
  'violation:report',
  'violation:read:any',
  'violation:triage',
  'violation:ocr:propose',
  'violation:decide',
  'violation:void',

  // appeals
  'appeal:file',
  'appeal:review',

  // gate operations
  'pass:issue',
  'pass:scan',
  'pass:revoke:any',
  'unknownVehicle:log',

  // alerting
  'alert:raise',
  'dispatch:read',
  'dispatch:assign',

  // configuration
  'event:create',
  'import:csv',

  // administration
  'user:manage',
  'role:assign',
  'analytics:read',
  'audit:read',
  'settings:manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * The agreed matrix. Anything not listed is denied — there is no wildcard,
 * including for ADMIN, so that widening a role is always a visible diff.
 *
 * Two deliberate omissions:
 *  - SUPERVISOR holds both `violation:decide` and `appeal:review`, but
 *    `rules.ts` forbids exercising them on the same violation. Cross-shift
 *    rotation (morning/night) provides the second impartial reviewer.
 *  - SUPERVISOR does not hold `role:assign`. Only ADMIN does, so the
 *    person allocating slots cannot promote themselves.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  EMPLOYEE: [
    'vehicle:request',
    'zone:read',
    'reservation:create',
    'violation:report',
    'appeal:file',
    'pass:issue',
    'alert:raise',
  ],

  GUARD: [
    'zone:read',
    'vehicle:read:any',
    'reservation:create:onBehalf',
    'violation:report',
    'violation:read:any',
    'violation:triage',
    'violation:ocr:propose',
    'appeal:file',
    'pass:issue',
    'pass:scan',
    'unknownVehicle:log',
    'alert:raise',
    'dispatch:read',
    'analytics:read',
  ],

  SUPERVISOR: [
    'zone:read',
    'zone:write',
    'spot:assign',
    'vehicle:read:any',
    'reservation:create',
    'reservation:create:onBehalf',
    'reservation:cancel:any',
    'reservation:forceRelease',
    'violation:report',
    'violation:read:any',
    'violation:triage',
    'violation:decide',
    'violation:void',
    'appeal:file',
    'appeal:review',
    'pass:issue',
    'pass:scan',
    'pass:revoke:any',
    'unknownVehicle:log',
    'alert:raise',
    'dispatch:read',
    'dispatch:assign',
    'event:create',
    'analytics:read',
  ],

  ADMIN: [
    'vehicle:approve',
    'vehicle:read:any',
    'zone:read',
    'zone:write',
    'violation:read:any',
    'appeal:review',
    'import:csv',
    'user:manage',
    'role:assign',
    'analytics:read',
    'audit:read',
    'settings:manage',
  ],
}

/**
 * Permissions for which zone scope is meaningful.
 *
 * A guard assigned to Block A should only triage Block A's reports — that is
 * what scoping is for. But checking a visitor pass at the gate, reading your
 * own dispatch list, or filing an appeal are not per-zone acts, and applying
 * scope to them locks a zone-scoped guard out of their actual job.
 *
 * Anything absent from this set ignores `scopeZoneIds` entirely. Adding a
 * permission here makes it stricter, never looser, so the safe default for a
 * new permission is to leave it out and add it deliberately.
 */
export const ZONE_SCOPED_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  'violation:report',
  'violation:read:any',
  'violation:triage',
  'violation:ocr:propose',
  'violation:decide',
  'violation:void',
  'unknownVehicle:log',
  'alert:raise',
  // Not 'dispatch:read': a guard reads the dispatches assigned to them, which
  // is filtered by assignment, not zone. Alerts carry no zone at all.
  'reservation:create',
  'reservation:create:onBehalf',
  'reservation:cancel:any',
  'reservation:forceRelease',
  'zone:write',
  'spot:assign',
  'event:create',
  'pass:revoke:any',
])

export type ActorRole = {
  role: Role
  scopeZoneIds: string[]
  validFrom: Date | null
  validTo: Date | null
}

export type Actor = {
  userId: string
  employeeId: string
  name: string
  /** Drives entitlements — which zones this person is eligible to book. */
  userType: UserType
  roles: ActorRole[]
}

/** A role only counts inside its validity window (shift cover, temp elevation). */
export function isRoleActive(role: ActorRole, now: Date = new Date()): boolean {
  if (role.validFrom && now < role.validFrom) return false
  if (role.validTo && now > role.validTo) return false
  return true
}

export function activeRoles(actor: Actor, now: Date = new Date()): ActorRole[] {
  return actor.roles.filter((r) => isRoleActive(r, now))
}

export function hasRole(actor: Actor, role: Role, now: Date = new Date()): boolean {
  return activeRoles(actor, now).some((r) => r.role === role)
}

export type PermissionContext = {
  /** Required when the granting role is zone-scoped. */
  zoneId?: string
  now?: Date
}

/**
 * Grants if any currently-active role both holds the permission and is either
 * org-wide or scoped to `ctx.zoneId`.
 *
 * A scoped role with no `zoneId` supplied is denied rather than allowed. That
 * is deliberate: forgetting to pass the zone must fail closed.
 */
export function can(
  actor: Actor,
  permission: Permission,
  ctx: PermissionContext = {},
): boolean {
  const now = ctx.now ?? new Date()

  return activeRoles(actor, now).some((assigned) => {
    if (!ROLE_PERMISSIONS[assigned.role].includes(permission)) return false

    // Org-wide role.
    if (assigned.scopeZoneIds.length === 0) return true

    // The role is scoped, but this action is not a per-zone act.
    if (!ZONE_SCOPED_PERMISSIONS.has(permission)) return true

    // Zone-scoped role and zone-scoped action: the action must name a zone
    // inside the scope.
    return ctx.zoneId !== undefined && assigned.scopeZoneIds.includes(ctx.zoneId)
  })
}

export class ForbiddenError extends Error {
  readonly permission: Permission
  readonly zoneId?: string

  constructor(permission: Permission, zoneId?: string) {
    super(
      zoneId
        ? `Missing permission "${permission}" for zone ${zoneId}`
        : `Missing permission "${permission}"`,
    )
    this.name = 'ForbiddenError'
    this.permission = permission
    this.zoneId = zoneId
  }
}

export function assertCan(
  actor: Actor,
  permission: Permission,
  ctx: PermissionContext = {},
): void {
  if (!can(actor, permission, ctx)) {
    throw new ForbiddenError(permission, ctx.zoneId)
  }
}

/**
 * Does any active role grant this permission in *any* scope?
 *
 * Use only as a cheap gate before doing expensive work — parsing a multipart
 * upload, say — so an unauthorized caller cannot make the server read an 8 MB
 * body before being refused. It deliberately ignores zone scope, so it is
 * never sufficient on its own: the authoritative check is still `can()` with
 * the zone, which every service performs.
 */
export function holdsPermission(
  actor: Actor,
  permission: Permission,
  now: Date = new Date(),
): boolean {
  return activeRoles(actor, now).some((assigned) =>
    ROLE_PERMISSIONS[assigned.role].includes(permission),
  )
}

/** Zone ids this actor's scoped roles are limited to; null means org-wide. */
export function scopedZoneIds(actor: Actor, now: Date = new Date()): string[] | null {
  const roles = activeRoles(actor, now)
  if (roles.length === 0) return []
  if (roles.some((r) => r.scopeZoneIds.length === 0)) return null

  return [...new Set(roles.flatMap((r) => r.scopeZoneIds))]
}

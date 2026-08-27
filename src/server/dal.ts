import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { UserStatus } from '@/generated/prisma/enums'
import { readSession } from './session'
import type { Actor, Permission, PermissionContext } from './permissions'
import { ForbiddenError, assertCan, can } from './permissions'

/**
 * Data Access Layer.
 *
 * Authorization lives here and at the mutation sites — never in `proxy.ts`.
 * Next 16's own guidance is explicit that Proxy is for optimistic redirects
 * only and "should not be used as a full session management or authorization
 * solution", so the proxy bounces obviously-signed-out traffic and every
 * actual decision is made next to the data.
 *
 * `cache()` memoises within a single render pass so a page that checks
 * permissions in five places still issues one query.
 */

export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await readSession()
  if (!session) return null

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      employeeId: true,
      name: true,
      userType: true,
      status: true,
      roles: {
        select: {
          role: true,
          scopeZoneIds: true,
          validFrom: true,
          validTo: true,
        },
      },
    },
  })

  // A user deactivated mid-session loses access immediately rather than at
  // token expiry.
  if (!user || user.status !== UserStatus.ACTIVE) return null

  return {
    userId: user.id,
    employeeId: user.employeeId,
    name: user.name,
    userType: user.userType,
    roles: user.roles,
  }
})

/** For pages and server components: redirects to login when signed out. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor()
  if (!actor) redirect('/login')
  return actor
}

/** For route handlers: throws instead of redirecting. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('Not signed in')
    this.name = 'UnauthenticatedError'
  }
}

export async function requireActorOrThrow(): Promise<Actor> {
  const actor = await getActor()
  if (!actor) throw new UnauthenticatedError()
  return actor
}

/**
 * The workhorse for protected routes: resolves the actor and asserts a
 * permission in one call.
 */
export async function authorize(
  permission: Permission,
  ctx: PermissionContext = {},
): Promise<Actor> {
  const actor = await requireActorOrThrow()
  assertCan(actor, permission, ctx)
  return actor
}

/** Non-throwing variant for conditionally rendering UI. */
export async function currentCan(
  permission: Permission,
  ctx: PermissionContext = {},
): Promise<boolean> {
  const actor = await getActor()
  if (!actor) return false
  return can(actor, permission, ctx)
}

export { ForbiddenError }

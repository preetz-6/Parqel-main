import 'server-only'

import { prisma } from '@/lib/prisma'
import type { UserType } from '@/generated/prisma/enums'

/**
 * Entitlements — which zones a user type is *eligible* for.
 *
 * Deliberately not permissions. A permission answers "may this person perform
 * this action"; an entitlement answers "is this person eligible for this
 * resource". Conflating them is what produces role explosion: without the
 * split, "students cannot book the staff lot" becomes a new role, and then so
 * does every other combination.
 *
 * A zone with no entitlement rows is open to everyone. Absent means
 * unconstrained, matching how zone-scoped permissions behave — a new zone is
 * usable by default and gets locked down deliberately.
 */

export class NotEntitledError extends Error {
  readonly zoneName: string

  constructor(zoneName: string) {
    super(`Your role is not eligible to book ${zoneName}.`)
    this.name = 'NotEntitledError'
    this.zoneName = zoneName
  }
}

export async function entitledUserTypes(zoneId: string): Promise<UserType[] | null> {
  const rows = await prisma.zoneEntitlement.findMany({
    where: { zoneId },
    select: { userType: true },
  })
  return rows.length === 0 ? null : rows.map((row) => row.userType)
}

export async function isEntitled(zoneId: string, userType: UserType): Promise<boolean> {
  const allowed = await entitledUserTypes(zoneId)
  return allowed === null || allowed.includes(userType)
}

export async function assertEntitled(
  zone: { id: string; name: string },
  userType: UserType,
): Promise<void> {
  if (!(await isEntitled(zone.id, userType))) {
    throw new NotEntitledError(zone.name)
  }
}

/** Bulk variant so an availability listing does not issue one query per zone. */
export async function entitlementMap(
  zoneIds: string[],
): Promise<Map<string, UserType[]>> {
  const rows = await prisma.zoneEntitlement.findMany({
    where: { zoneId: { in: zoneIds } },
    select: { zoneId: true, userType: true },
  })

  const map = new Map<string, UserType[]>()
  for (const row of rows) {
    const existing = map.get(row.zoneId)
    if (existing) existing.push(row.userType)
    else map.set(row.zoneId, [row.userType])
  }
  return map
}

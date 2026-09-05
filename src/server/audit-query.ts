import 'server-only'

import { prisma } from '@/lib/prisma'
import { ForbiddenError, can, type Actor } from './permissions'

/**
 * Reading the audit trail.
 *
 * Only `audit:read` (held by Admin) grants access. The parking-scoped
 * `audit:read:parking` permission was removed when the Parking Admin role
 * was consolidated into Supervisor + Admin.
 */

export type AuditFilters = {
  action?: string
  entity?: string
  actorEmployeeId?: string
  page?: number
}

export type AuditRow = {
  id: string
  action: string
  entity: string
  entityId: string
  createdAt: Date
  ip: string | null
  actor: { name: string; employeeId: string } | null
  newValue: unknown
}

export type AuditPage = {
  rows: AuditRow[]
  total: number
  page: number
  pageCount: number
  /** @deprecated Always false — parking-only scope was removed. */
  restricted: boolean
  actions: string[]
}

const PAGE_SIZE = 50

export async function readAuditLog(
  actor: Actor,
  filters: AuditFilters = {},
): Promise<AuditPage> {
  if (!can(actor, 'audit:read')) throw new ForbiddenError('audit:read')

  const page = Math.max(1, filters.page ?? 1)

  const where = {
    ...(filters.action ? { action: { startsWith: filters.action } } : {}),
    ...(filters.entity ? { entity: filters.entity } : {}),
    ...(filters.actorEmployeeId
      ? { actor: { employeeId: filters.actorEmployeeId.trim().toUpperCase() } }
      : {}),
  }

  const [rows, total, distinctActions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        createdAt: true,
        ip: true,
        newValue: true,
        actor: { select: { name: true, employeeId: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      select: { action: true },
      distinct: ['action'],
      orderBy: { action: 'asc' },
    }),
  ])

  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    restricted: false,
    actions: distinctActions.map((row) => row.action),
  }
}

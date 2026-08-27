import 'server-only'

import { prisma } from '@/lib/prisma'
import { ForbiddenError, can, type Actor } from './permissions'
import { PARKING_ACTION_PREFIXES } from './audit-visibility'

/**
 * Reading the audit trail.
 *
 * The permission matrix draws a line here that matters: `audit:read:parking`
 * shows what happened to vehicles, violations and zones; `audit:read` also
 * shows authentication, denied authorization attempts and role changes.
 * See `audit-visibility.ts` for why, and for the tests.
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
  /** True when the caller only sees parking actions. */
  restricted: boolean
  actions: string[]
}

const PAGE_SIZE = 50

export async function readAuditLog(
  actor: Actor,
  filters: AuditFilters = {},
): Promise<AuditPage> {
  const full = can(actor, 'audit:read')
  const parkingOnly = !full && can(actor, 'audit:read:parking')

  if (!full && !parkingOnly) throw new ForbiddenError('audit:read')

  const page = Math.max(1, filters.page ?? 1)

  const scopeClause = parkingOnly
    ? { OR: PARKING_ACTION_PREFIXES.map((prefix) => ({ action: { startsWith: prefix } })) }
    : {}

  const where = {
    ...scopeClause,
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
      where: scopeClause,
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
    restricted: parkingOnly,
    actions: distinctActions.map((row) => row.action),
  }
}

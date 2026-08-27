import 'server-only'

import { prisma } from '@/lib/prisma'
import { AppealDecision, ViolationStatus, ZoneVehicleClass } from '@/generated/prisma/enums'
import type { Actor } from '../permissions'
import { scopedZoneIds } from '../permissions'

/**
 * Operational analytics.
 *
 * Two rules shape what is here. First, every figure is scoped: a zone-limited
 * guard sees their zones, not the whole site. Second, nothing is reported that
 * the data cannot honestly support — there is no revenue metric because v1 has
 * no fines, and duration figures come only from closed check-ins, since an
 * open one has no end and averaging it in would quietly understate everything.
 */

export type AnalyticsRange = { since: Date; label: string }

export function rangeFromDays(days: number): AnalyticsRange {
  return {
    since: new Date(Date.now() - days * 86_400_000),
    label: days === 1 ? 'last 24 hours' : `last ${days} days`,
  }
}

export type ZoneUtilisation = {
  zoneId: string
  name: string
  capacity: number
  occupied: number
  percent: number
  isCapacityOnly: boolean
}

export type Analytics = {
  range: AnalyticsRange
  scopedToZones: number | null
  zones: ZoneUtilisation[]
  violations: {
    total: number
    byStatus: Record<string, number>
    byType: Array<{ type: string; count: number }>
    approvalRate: number | null
  }
  repeatOffenders: Array<{
    plateNumber: string
    ownerName: string
    ownerEmployeeId: string
    upheld: number
  }>
  appeals: {
    filed: number
    decided: number
    overturned: number
    /** Share of *decided* appeals that went the appellant's way. */
    successRate: number | null
  }
  parking: {
    closedSessions: number
    averageMinutes: number | null
    peakHours: Array<{ hour: number; count: number }>
  }
  response: {
    dispatches: number
    averageResponseMinutes: number | null
    averageResolveMinutes: number | null
  }
}

export async function buildAnalytics(
  actor: Actor,
  range: AnalyticsRange = rangeFromDays(30),
): Promise<Analytics> {
  const scope = scopedZoneIds(actor)
  const zoneFilter = scope === null ? {} : { zoneId: { in: scope } }

  const [zones, violations, appeals, checkIns, dispatches] = await Promise.all([
    prisma.parkingZone.findMany({
      where: scope === null ? {} : { id: { in: scope } },
      select: {
        id: true,
        name: true,
        capacity: true,
        vehicleClass: true,
        _count: { select: { spots: true, checkIns: { where: { checkedOutAt: null } } } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.violation.findMany({
      where: { ...zoneFilter, createdAt: { gte: range.since } },
      select: {
        status: true,
        type: true,
        matchedVehicle: {
          select: {
            plateNumber: true,
            owner: { select: { name: true, employeeId: true } },
          },
        },
      },
    }),
    prisma.appeal.findMany({
      where: { createdAt: { gte: range.since } },
      select: { decision: true },
    }),
    prisma.checkIn.findMany({
      where: { ...zoneFilter, checkedInAt: { gte: range.since } },
      select: { checkedInAt: true, checkedOutAt: true },
    }),
    prisma.dispatch.findMany({
      where: { createdAt: { gte: range.since } },
      select: { createdAt: true, respondedAt: true, resolvedAt: true, status: true },
    }),
  ])

  // ── zones ────────────────────────────────────────────────
  const zoneUtilisation: ZoneUtilisation[] = zones.map((zone) => {
    const isCapacityOnly = zone.vehicleClass === ZoneVehicleClass.TWO_WHEELER
    const capacity = isCapacityOnly ? zone.capacity : zone._count.spots
    const occupied = zone._count.checkIns
    return {
      zoneId: zone.id,
      name: zone.name,
      capacity,
      occupied,
      percent: capacity === 0 ? 0 : Math.round((occupied / capacity) * 100),
      isCapacityOnly,
    }
  })

  // ── violations ───────────────────────────────────────────
  const byStatus: Record<string, number> = {}
  const byTypeMap = new Map<string, number>()
  const offenderMap = new Map<
    string,
    { plateNumber: string; ownerName: string; ownerEmployeeId: string; upheld: number }
  >()

  for (const violation of violations) {
    byStatus[violation.status] = (byStatus[violation.status] ?? 0) + 1
    byTypeMap.set(violation.type, (byTypeMap.get(violation.type) ?? 0) + 1)

    // Only upheld violations count against someone. A report that was
    // rejected or voided is not a mark on the driver's record.
    if (violation.status === ViolationStatus.APPROVED && violation.matchedVehicle) {
      const key = violation.matchedVehicle.plateNumber
      const existing = offenderMap.get(key)
      if (existing) existing.upheld++
      else
        offenderMap.set(key, {
          plateNumber: key,
          ownerName: violation.matchedVehicle.owner.name,
          ownerEmployeeId: violation.matchedVehicle.owner.employeeId,
          upheld: 1,
        })
    }
  }

  const decidedViolations =
    (byStatus[ViolationStatus.APPROVED] ?? 0) + (byStatus[ViolationStatus.REJECTED] ?? 0)

  // ── appeals ──────────────────────────────────────────────
  const decidedAppeals = appeals.filter((a) => a.decision !== AppealDecision.PENDING)
  const overturned = decidedAppeals.filter((a) => a.decision === AppealDecision.OVERTURNED).length

  // ── parking duration and peaks ───────────────────────────
  const closed = checkIns.filter((c) => c.checkedOutAt !== null)
  const totalMinutes = closed.reduce(
    (sum, c) => sum + (c.checkedOutAt!.getTime() - c.checkedInAt.getTime()) / 60_000,
    0,
  )

  const hourCounts = new Array<number>(24).fill(0)
  for (const checkIn of checkIns) hourCounts[checkIn.checkedInAt.getHours()]!++

  const peakHours = hourCounts
    .map((count, hour) => ({ hour, count }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  // ── dispatch response ────────────────────────────────────
  const responded = dispatches.filter((d) => d.respondedAt !== null)
  const resolved = dispatches.filter((d) => d.resolvedAt !== null)

  const averageOf = (values: number[]): number | null =>
    values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length)

  return {
    range,
    scopedToZones: scope === null ? null : scope.length,
    zones: zoneUtilisation,
    violations: {
      total: violations.length,
      byStatus,
      byType: [...byTypeMap.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      approvalRate:
        decidedViolations === 0
          ? null
          : Math.round(((byStatus[ViolationStatus.APPROVED] ?? 0) / decidedViolations) * 100),
    },
    repeatOffenders: [...offenderMap.values()]
      .filter((offender) => offender.upheld > 1)
      .sort((a, b) => b.upheld - a.upheld)
      .slice(0, 10),
    appeals: {
      filed: appeals.length,
      decided: decidedAppeals.length,
      overturned,
      successRate:
        decidedAppeals.length === 0
          ? null
          : Math.round((overturned / decidedAppeals.length) * 100),
    },
    parking: {
      closedSessions: closed.length,
      averageMinutes: closed.length === 0 ? null : Math.round(totalMinutes / closed.length),
      peakHours,
    },
    response: {
      dispatches: dispatches.length,
      averageResponseMinutes: averageOf(
        responded.map((d) => (d.respondedAt!.getTime() - d.createdAt.getTime()) / 60_000),
      ),
      averageResolveMinutes: averageOf(
        resolved.map(
          (d) => (d.resolvedAt!.getTime() - d.createdAt.getTime()) / 60_000,
        ),
      ),
    },
  }
}

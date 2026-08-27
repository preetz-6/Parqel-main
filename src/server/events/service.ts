import 'server-only'

import { prisma } from '@/lib/prisma'
import {
  AlertSeverity,
  AllocationType,
  NotificationChannel,
  NotificationStatus,
} from '@/generated/prisma/enums'
import { audited, type AuditContext, type AuditEntry } from '../audit'
import { assertCan, type Actor } from '../permissions'

export class EventError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EventError'
  }
}

const MAX_EVENT_DAYS = 14

/**
 * Events temporarily open zones for a programme.
 *
 * An event may override a FIXED zone — a convocation taking over staff parking
 * is exactly the case this exists for. When it does, everyone holding a slot
 * there **must** be told, because arriving to find your assigned bay taken by
 * a stranger is precisely the situation that generates the angry reports this
 * whole system is meant to reduce. Notifying them is not a nicety; it is the
 * reason overriding a fixed zone is allowed at all.
 */
export async function createEvent(
  actor: Actor,
  input: { name: string; zoneIds: string[]; startTime: Date; endTime: Date },
  ip?: string | null,
): Promise<{ id: string; displacedCount: number }> {
  const name = input.name.trim()
  if (name.length < 3) throw new EventError('Give the event a name.')
  if (input.zoneIds.length === 0) throw new EventError('Choose at least one zone.')
  if (input.endTime <= input.startTime) {
    throw new EventError('The event must end after it starts.')
  }
  if (input.endTime.getTime() - input.startTime.getTime() > MAX_EVENT_DAYS * 86_400_000) {
    throw new EventError(`Events cannot run longer than ${MAX_EVENT_DAYS} days.`)
  }

  for (const zoneId of input.zoneIds) {
    assertCan(actor, 'event:create', { zoneId })
  }

  const zones = await prisma.parkingZone.findMany({
    where: { id: { in: input.zoneIds } },
    select: { id: true, name: true, allocationType: true },
  })

  if (zones.length !== input.zoneIds.length) {
    throw new EventError('One of those zones no longer exists.')
  }

  const overriddenFixed = zones.filter((z) => z.allocationType === AllocationType.FIXED)

  // Whoever holds a slot in an overridden fixed zone for the event window.
  const displaced = overriddenFixed.length
    ? await prisma.slotAssignment.findMany({
        where: {
          spot: { zoneId: { in: overriddenFixed.map((z) => z.id) } },
          startDate: { lte: input.endTime },
          OR: [{ endDate: null }, { endDate: { gte: input.startTime } }],
        },
        select: {
          userId: true,
          spot: { select: { code: true, zone: { select: { name: true } } } },
        },
      })
    : []

  const displacedUserIds = [...new Set(displaced.map((d) => d.userId))]

  const ctx: AuditContext = { actorUserId: actor.userId, ip }

  const result = await audited(
    ctx,
    async (tx) => {
      const event = await tx.event.create({
        data: {
          name,
          startTime: input.startTime,
          endTime: input.endTime,
          createdById: actor.userId,
          zones: { connect: input.zoneIds.map((id) => ({ id })) },
        },
      })

      if (displacedUserIds.length === 0) return { event, alertId: null as string | null }

      const when = input.startTime.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })

      const alert = await tx.alert.create({
        data: {
          severity: AlertSeverity.MEDIUM,
          createdById: actor.userId,
          message:
            `${name}: your assigned parking in ` +
            `${overriddenFixed.map((z) => z.name).join(', ')} is unavailable from ${when}. ` +
            `Use a shared zone for the duration.`,
        },
      })

      await tx.notification.createMany({
        data: displacedUserIds.map((userId) => ({
          alertId: alert.id,
          userId,
          channel: NotificationChannel.IN_APP,
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        })),
      })

      return { event, alertId: alert.id }
    },
    ({ event, alertId }) => {
      const entries: AuditEntry[] = [
        {
          action: 'event.create',
          entity: 'Event',
          entityId: event.id,
          newValue: {
            name: event.name,
            zoneIds: input.zoneIds,
            overriddenFixedZones: overriddenFixed.map((z) => z.name),
            displacedCount: displacedUserIds.length,
          },
        },
      ]

      if (alertId) {
        entries.push({
          action: 'event.displacementNotice',
          entity: 'Alert',
          entityId: alertId,
          newValue: { eventId: event.id, notified: displacedUserIds.length },
        })
      }

      return entries
    },
  )

  return { id: result.event.id, displacedCount: displacedUserIds.length }
}

export async function upcomingEvents(limit = 20) {
  return prisma.event.findMany({
    where: { endTime: { gte: new Date() } },
    select: {
      id: true,
      name: true,
      startTime: true,
      endTime: true,
      createdBy: { select: { name: true, employeeId: true } },
      zones: { select: { id: true, name: true, allocationType: true } },
    },
    orderBy: { startTime: 'asc' },
    take: limit,
  })
}

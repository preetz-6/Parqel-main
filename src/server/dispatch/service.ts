import 'server-only'

import { prisma } from '@/lib/prisma'
import {
  AlertSeverity,
  AlertStatus,
  DispatchStatus,
  Role,
} from '@/generated/prisma/enums'
import { audited, type AuditContext, type AuditEntry } from '../audit'
import { assertCan, type Actor } from '../permissions'

export class DispatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DispatchError'
  }
}

/**
 * Emergency alerts and guard dispatch.
 *
 * Separate from the violation flow on purpose. A blocked fire lane cannot wait
 * for triage and a supervisor's decision — somebody has to walk over now. This
 * is the path for "a human needs to go and look", and it is also where an
 * unknown vehicle ends up, since there is no owner to notify.
 */
export async function raiseEmergencyAlert(
  actor: Actor,
  input: { severity: AlertSeverity; message: string; zoneId: string; vehicleId?: string | null },
  ip?: string | null,
): Promise<{ id: string }> {
  assertCan(actor, 'alert:raise', { zoneId: input.zoneId })

  const message = input.message.trim()
  if (message.length < 5) throw new DispatchError('Describe what is happening.')

  const zone = await prisma.parkingZone.findUnique({
    where: { id: input.zoneId },
    select: { name: true },
  })
  if (!zone) throw new DispatchError('That parking zone no longer exists.')

  const alert = await audited(
    { actorUserId: actor.userId, ip } satisfies AuditContext,
    (tx) =>
      tx.alert.create({
        data: {
          severity: input.severity,
          status: AlertStatus.OPEN,
          createdById: actor.userId,
          vehicleId: input.vehicleId ?? null,
          message: `${message} (${zone.name})`,
        },
      }),
    (created) => ({
      action: 'alert.emergency',
      entity: 'Alert',
      entityId: created.id,
      newValue: { severity: created.severity, zoneId: input.zoneId },
    }),
  )

  return { id: alert.id }
}

export async function dispatchGuard(
  actor: Actor,
  alertId: string,
  guardUserId: string,
  ip?: string | null,
): Promise<void> {
  assertCan(actor, 'dispatch:assign')

  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: { id: true, status: true },
  })
  if (!alert) throw new DispatchError('That alert no longer exists.')

  if (alert.status === AlertStatus.RESOLVED) {
    throw new DispatchError('That alert is already resolved.')
  }

  const guard = await prisma.user.findFirst({
    where: { id: guardUserId, roles: { some: { role: { in: [Role.GUARD, Role.SUPERVISOR] } } } },
    select: { id: true },
  })
  if (!guard) throw new DispatchError('That person is not security staff.')

  const existing = await prisma.dispatch.findFirst({
    where: { alertId, assignedGuardId: guardUserId, status: { not: DispatchStatus.RESOLVED } },
    select: { id: true },
  })
  if (existing) throw new DispatchError('That guard is already assigned to this alert.')

  await audited(
    { actorUserId: actor.userId, ip } satisfies AuditContext,
    async (tx) => {
      const dispatch = await tx.dispatch.create({
        data: {
          alertId,
          assignedGuardId: guardUserId,
          dispatchedById: actor.userId,
        },
      })

      await tx.alert.update({
        where: { id: alertId },
        data: { status: AlertStatus.DISPATCHED },
      })

      return dispatch
    },
    (dispatch) =>
      [
        {
          action: 'dispatch.assign',
          entity: 'Dispatch',
          entityId: dispatch.id,
          newValue: { alertId, assignedGuardId: guardUserId },
        },
        {
          action: 'alert.dispatched',
          entity: 'Alert',
          entityId: alertId,
          oldValue: { status: alert.status },
          newValue: { status: AlertStatus.DISPATCHED },
        },
      ] satisfies AuditEntry[],
  )
}

/**
 * A guard updating their own dispatch. Responding and resolving are the guard's
 * to record — they are the one standing there.
 */
export async function updateDispatch(
  actor: Actor,
  dispatchId: string,
  status: 'RESPONDING' | 'RESOLVED',
  ip?: string | null,
): Promise<void> {
  const dispatch = await prisma.dispatch.findUnique({
    where: { id: dispatchId },
    select: { id: true, status: true, assignedGuardId: true, alertId: true },
  })
  if (!dispatch) throw new DispatchError('That dispatch no longer exists.')

  // Your own dispatch, or you can assign dispatches in the first place.
  if (dispatch.assignedGuardId !== actor.userId) {
    assertCan(actor, 'dispatch:assign')
  } else {
    assertCan(actor, 'dispatch:read')
  }

  if (dispatch.status === DispatchStatus.RESOLVED) {
    throw new DispatchError('That dispatch is already resolved.')
  }

  const target = status === 'RESPONDING' ? DispatchStatus.RESPONDING : DispatchStatus.RESOLVED
  const now = new Date()

  await audited(
    { actorUserId: actor.userId, ip } satisfies AuditContext,
    async (tx) => {
      const updated = await tx.dispatch.update({
        where: { id: dispatchId },
        data: {
          status: target,
          respondedAt: target === DispatchStatus.RESPONDING ? now : undefined,
          resolvedAt: target === DispatchStatus.RESOLVED ? now : undefined,
        },
      })

      // The alert closes only when nothing is still out on it.
      if (target === DispatchStatus.RESOLVED) {
        const outstanding = await tx.dispatch.count({
          where: { alertId: dispatch.alertId, status: { not: DispatchStatus.RESOLVED } },
        })
        if (outstanding === 0) {
          await tx.alert.update({
            where: { id: dispatch.alertId },
            data: { status: AlertStatus.RESOLVED },
          })
        }
      }

      return updated
    },
    (updated) => ({
      action: `dispatch.${target.toLowerCase()}`,
      entity: 'Dispatch',
      entityId: updated.id,
      oldValue: { status: dispatch.status },
      newValue: { status: target },
    }),
  )
}

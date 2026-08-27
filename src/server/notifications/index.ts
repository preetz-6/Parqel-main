import 'server-only'

import { prisma } from '@/lib/prisma'
import {
  AlertSeverity,
  NotificationChannel,
  NotificationStatus,
  ViolationType,
} from '@/generated/prisma/enums'
import type { TxClient } from '../audit'

/**
 * Alert fan-out.
 *
 * One Notification row per delivery attempt per channel, so "we tried to tell
 * them and they never acknowledged" is a fact in the database rather than an
 * assertion. That record is what makes escalation defensible later.
 *
 * v1 emits IN_APP and PUSH only. SMS and VOICE exist in the enum but are
 * unreachable until TRAI DLT registration is done — see docs/DESIGN.md §3.
 */

/** How loud a violation type is. Blocking a fire lane is not a parking dispute. */
const SEVERITY: Record<ViolationType, AlertSeverity> = {
  FIRE_LANE: AlertSeverity.CRITICAL,
  BLOCKING: AlertSeverity.HIGH,
  DOUBLE_PARK: AlertSeverity.MEDIUM,
  WRONG_SLOT: AlertSeverity.MEDIUM,
  NO_PERMIT: AlertSeverity.LOW,
  OTHER: AlertSeverity.LOW,
}

export function severityFor(type: ViolationType): AlertSeverity {
  return SEVERITY[type]
}

const MESSAGES: Record<ViolationType, string> = {
  FIRE_LANE: 'Your vehicle is blocking a fire lane. Move it immediately.',
  BLOCKING: 'Your vehicle is blocking someone in. Please move it.',
  DOUBLE_PARK: 'Your vehicle is double parked.',
  WRONG_SLOT: 'Your vehicle is parked in a slot assigned to someone else.',
  NO_PERMIT: 'Your vehicle is parked without a valid permit for this zone.',
  OTHER: 'Your vehicle has been reported for a parking issue.',
}

export function messageFor(type: ViolationType, zoneName: string): string {
  return `${MESSAGES[type]} (${zoneName})`
}

export type RaisedAlert = { alertId: string; notificationIds: string[] }

/**
 * Creates the alert and its queued notifications inside the caller's
 * transaction, so an approved violation can never exist without its alert.
 */
export async function raiseViolationAlert(
  tx: TxClient,
  input: {
    violationId: string
    vehicleId: string
    ownerUserId: string
    type: ViolationType
    zoneName: string
    createdById: string
  },
): Promise<RaisedAlert> {
  const alert = await tx.alert.create({
    data: {
      severity: severityFor(input.type),
      vehicleId: input.vehicleId,
      violationId: input.violationId,
      createdById: input.createdById,
      message: messageFor(input.type, input.zoneName),
    },
  })

  const channels: NotificationChannel[] = [NotificationChannel.IN_APP, NotificationChannel.PUSH]

  const notifications = await Promise.all(
    channels.map((channel) =>
      tx.notification.create({
        data: {
          alertId: alert.id,
          userId: input.ownerUserId,
          channel,
          // In-app is delivered the moment the row exists — the owner reads it
          // from their own list. Push has to leave the building first.
          status:
            channel === NotificationChannel.IN_APP
              ? NotificationStatus.SENT
              : NotificationStatus.QUEUED,
          sentAt: channel === NotificationChannel.IN_APP ? new Date() : null,
        },
      }),
    ),
  )

  return { alertId: alert.id, notificationIds: notifications.map((n) => n.id) }
}

/**
 * Delivers queued push notifications.
 *
 * v1 has one provider: the server log. Real FCM needs a Firebase service
 * account and device tokens per user, neither of which exists yet — so this
 * mirrors the OTP pattern rather than pretending to send.
 */
export async function flushQueuedPush(): Promise<{ sent: number; failed: number }> {
  const provider = process.env.PUSH_PROVIDER ?? 'console'

  const queued = await prisma.notification.findMany({
    where: { channel: NotificationChannel.PUSH, status: NotificationStatus.QUEUED },
    take: 100,
    include: {
      user: { select: { name: true, employeeId: true } },
      alert: { select: { message: true, severity: true } },
    },
  })

  let sent = 0
  let failed = 0

  for (const notification of queued) {
    if (provider === 'console') {
      console.info(
        `  [PUSH] ${notification.user.employeeId} ${notification.user.name} ` +
          `[${notification.alert.severity}] ${notification.alert.message}`,
      )
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      })
      sent++
      continue
    }

    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: NotificationStatus.FAILED,
        failureReason: `PUSH_PROVIDER "${provider}" is not implemented`,
      },
    })
    failed++
  }

  return { sent, failed }
}

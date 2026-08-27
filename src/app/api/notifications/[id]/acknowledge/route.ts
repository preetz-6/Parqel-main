import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { audited } from '@/server/audit'
import { clientIp } from '@/server/auth/request-ip'
import { AlertStatus } from '@/generated/prisma/enums'

/**
 * The owner acknowledging an alert.
 *
 * This is the fact the escalation ladder hangs off: "we told them and they saw
 * it" versus "we told them and heard nothing" is the difference between a
 * closed loop and a guard dispatch.
 */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<'/api/notifications/[id]/acknowledge'>,
) {
  try {
    const actor = await requireActorOrThrow()
    const { id } = await ctx.params

    const notification = await prisma.notification.findUnique({
      where: { id },
      select: { id: true, userId: true, alertId: true, acknowledgedAt: true },
    })

    // Only the recipient may acknowledge, and only once.
    if (!notification || notification.userId !== actor.userId) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }

    if (notification.acknowledgedAt) return NextResponse.json({ ok: true })

    await audited(
      { actorUserId: actor.userId, ip: await clientIp() },
      async (tx) => {
        const now = new Date()
        await tx.notification.update({
          where: { id: notification.id },
          data: { acknowledgedAt: now },
        })
        return tx.alert.update({
          where: { id: notification.alertId },
          data: { status: AlertStatus.ACKNOWLEDGED },
        })
      },
      (alert) => ({
        action: 'alert.acknowledge',
        entity: 'Alert',
        entityId: alert.id,
        newValue: { status: alert.status },
      }),
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}

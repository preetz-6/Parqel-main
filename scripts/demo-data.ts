import 'dotenv/config'

import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import {
  AlertSeverity,
  AlertStatus,
  AppealDecision,
  CheckInMethod,
  DispatchStatus,
  NotificationChannel,
  NotificationStatus,
  PassStatus,
  ReservationStatus,
  ViolationStatus,
  ViolationType,
} from '../src/generated/prisma/enums'

/**
 * Demo scenario, layered on top of `db:seed`.
 *
 * The seed gives a working campus with empty queues, which is honest but shows
 * nothing. This adds a day in the life: reports at every stage of review, an
 * appeal, a repeat offender, gate activity and a resolved emergency — so the
 * queues, analytics and audit log all have something real in them.
 *
 *   npm run db:demo
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const UPLOAD_ROOT = path.join(process.cwd(), '.uploads')

/** A real 1x1 PNG, so the evidence route serves something rather than 410. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function placeholderEvidence(): Promise<string> {
  const now = new Date()
  const shard = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const key = `${shard}/${randomUUID()}.png`
  const destination = path.join(UPLOAD_ROOT, key)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, PNG)
  return key
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000)
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000)

async function main() {
  console.info('Layering demo data…')

  const users = Object.fromEntries(
    (await prisma.user.findMany({ select: { id: true, employeeId: true } })).map((u) => [
      u.employeeId,
      u.id,
    ]),
  )
  const vehicles = Object.fromEntries(
    (await prisma.vehicle.findMany({ select: { id: true, plateNumber: true } })).map((v) => [
      v.plateNumber,
      v.id,
    ]),
  )
  const zones = Object.fromEntries(
    (await prisma.parkingZone.findMany({ select: { id: true, name: true } })).map((z) => [
      z.name,
      z.id,
    ]),
  )

  const required = ['ADM001', 'PRK001', 'SEC001', 'SEC002', 'FAC101', 'STU2201']
  for (const id of required) {
    if (!users[id]) throw new Error(`Seed first: missing user ${id}. Run npm run db:seed.`)
  }

  const mainLot = zones['Main Lot — Shared']!
  const bikeShed = zones['Two-Wheeler Shed']!
  const facultyLot = zones['Faculty Lot — Shared']!

  // ── violations at every stage ────────────────────────────
  // 1. Fresh report, waiting on a guard.
  await prisma.violation.create({
    data: {
      type: ViolationType.BLOCKING,
      status: ViolationStatus.SUBMITTED,
      reportedById: users.FAC101!,
      zoneId: mainLot,
      plateEntered: 'KA03HH8899',
      imageOriginal: await placeholderEvidence(),
      note: 'Parked across the ramp, I cannot get my car out.',
      createdAt: minutesAgo(25),
    },
  })

  // 2. Verified by a guard, waiting on a supervisor's decision. Typed plate
  //    has a typo the guard resolved against the registry.
  await prisma.violation.create({
    data: {
      type: ViolationType.WRONG_SLOT,
      status: ViolationStatus.TRIAGED,
      reportedById: users.STU2201!,
      zoneId: mainLot,
      plateEntered: 'KA01AB4S67',
      matchedVehicleId: vehicles.KA01AB4567!,
      triagedById: users.SEC002!,
      triagedAt: minutesAgo(90),
      imageOriginal: await placeholderEvidence(),
      createdAt: hoursAgo(2),
    },
  })

  // 3. Upheld, and the driver appealed. Gives the appeal queue something and
  //    exercises integrity rule 2 — SEC001 decided, so only a Parking Admin
  //    or Admin can review it.
  const appealed = await prisma.violation.create({
    data: {
      type: ViolationType.FIRE_LANE,
      status: ViolationStatus.APPROVED,
      reportedById: users.SEC002!,
      zoneId: mainLot,
      plateEntered: 'KA05MN1234',
      matchedVehicleId: vehicles.KA05MN1234!,
      triagedById: users.SEC002!,
      triagedAt: hoursAgo(20),
      decidedById: users.SEC001!,
      decidedAt: hoursAgo(19),
      imageOriginal: await placeholderEvidence(),
      createdAt: hoursAgo(21),
    },
  })

  await prisma.appeal.create({
    data: {
      violationId: appealed.id,
      userId: users.FAC101!,
      reason:
        'I was unloading equipment for the seminar and moved within five minutes. Security waved me through at the gate.',
      createdAt: hoursAgo(18),
    },
  })

  const alert = await prisma.alert.create({
    data: {
      severity: AlertSeverity.CRITICAL,
      status: AlertStatus.RESOLVED,
      vehicleId: vehicles.KA05MN1234!,
      violationId: appealed.id,
      createdById: users.SEC001!,
      message: 'Your vehicle is blocking a fire lane. Move it immediately. (Main Lot — Shared)',
      createdAt: hoursAgo(19),
    },
  })

  await prisma.notification.createMany({
    data: [
      {
        alertId: alert.id,
        userId: users.FAC101!,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.SENT,
        sentAt: hoursAgo(19),
        acknowledgedAt: hoursAgo(18),
      },
      {
        alertId: alert.id,
        userId: users.FAC101!,
        channel: NotificationChannel.PUSH,
        status: NotificationStatus.SENT,
        sentAt: hoursAgo(19),
      },
    ],
  })

  // 4. A second upheld report against the same vehicle, so the repeat
  //    offender panel is not empty.
  await prisma.violation.create({
    data: {
      type: ViolationType.NO_PERMIT,
      status: ViolationStatus.APPROVED,
      reportedById: users.SEC002!,
      zoneId: facultyLot,
      plateEntered: 'KA05MN1234',
      matchedVehicleId: vehicles.KA05MN1234!,
      triagedById: users.SEC002!,
      triagedAt: hoursAgo(70),
      decidedById: users.PRK001!,
      decidedAt: hoursAgo(69),
      imageOriginal: await placeholderEvidence(),
      createdAt: hoursAgo(71),
    },
  })

  // 5. A dismissed report, so the approval rate is not a flat 100%.
  await prisma.violation.create({
    data: {
      type: ViolationType.DOUBLE_PARK,
      status: ViolationStatus.REJECTED,
      reportedById: users.STU2201!,
      zoneId: mainLot,
      plateEntered: 'KA99ZZ0000',
      decidedById: users.SEC001!,
      decidedAt: hoursAgo(40),
      imageOriginal: await placeholderEvidence(),
      note: 'Photo shows the vehicle within its bay.',
      createdAt: hoursAgo(42),
    },
  })

  // ── emergency dispatch, already resolved ─────────────────
  const emergency = await prisma.alert.create({
    data: {
      severity: AlertSeverity.HIGH,
      status: AlertStatus.RESOLVED,
      createdById: users.FAC101!,
      message: 'Delivery van blocking the exit barrier (Main Lot — Shared)',
      createdAt: hoursAgo(6),
    },
  })

  await prisma.dispatch.create({
    data: {
      alertId: emergency.id,
      assignedGuardId: users.SEC002!,
      dispatchedById: users.SEC001!,
      status: DispatchStatus.RESOLVED,
      respondedAt: new Date(hoursAgo(6).getTime() + 4 * 60_000),
      resolvedAt: new Date(hoursAgo(6).getTime() + 15 * 60_000),
      createdAt: hoursAgo(6),
    },
  })

  // ── gate activity ────────────────────────────────────────
  await prisma.visitorPass.create({
    data: {
      code: 'DEMO24AB',
      issuedById: users.FAC101!,
      hostUserId: users.FAC101!,
      visitorName: 'Sunita Rao',
      plate: 'KA41TT8080',
      vehicleClass: 'FOUR_WHEELER',
      zoneId: mainLot,
      validFrom: hoursAgo(1),
      validTo: new Date(Date.now() + 8 * 3_600_000),
      status: PassStatus.ACTIVE,
    },
  })

  // Same courier seen repeatedly — the signal the unknown-vehicle log exists
  // to surface.
  for (const at of [hoursAgo(50), hoursAgo(26), hoursAgo(3)]) {
    await prisma.unknownVehicleLog.create({
      data: {
        plate: 'KA51CO7788',
        zoneId: mainLot,
        loggedById: users.SEC002!,
        note: 'Courier van, parked across two bays',
        createdAt: at,
      },
    })
  }

  await prisma.unknownVehicleLog.create({
    data: {
      plate: 'TN09XY4321',
      zoneId: bikeShed,
      loggedById: users.SEC002!,
      note: 'Two-wheeler with no permit sticker',
      createdAt: hoursAgo(9),
    },
  })

  // ── completed parking, so durations and peaks are real ───
  const sessions: Array<[string, string, number, number]> = [
    ['KA05MN1234', mainLot, 30, 26],
    ['KA01AB4567', mainLot, 28, 22],
    ['KA03HH8899', bikeShed, 27, 21],
    ['KA05MN1234', facultyLot, 9, 4],
  ]

  for (const [plate, zoneId, startHoursAgo, endHoursAgo] of sessions) {
    await prisma.checkIn.create({
      data: {
        userId:
          plate === 'KA01AB4567'
            ? users.PRK001!
            : plate === 'KA03HH8899'
              ? users.STU2201!
              : users.FAC101!,
        vehicleId: vehicles[plate]!,
        zoneId,
        method: CheckInMethod.MANUAL,
        checkedInAt: hoursAgo(startHoursAgo),
        checkedOutAt: hoursAgo(endHoursAgo),
      },
    })
  }

  // A live booking so the parking page has something on arrival.
  const spot = await prisma.parkingSpot.findFirst({
    where: { zoneId: mainLot },
    orderBy: { code: 'asc' },
    select: { id: true },
  })

  if (spot) {
    await prisma.reservation.create({
      data: {
        userId: users.PRK001!,
        vehicleId: vehicles.KA01AB4567!,
        zoneId: mainLot,
        spotId: spot.id,
        startTime: minutesAgo(5),
        endTime: new Date(Date.now() + 4 * 3_600_000),
        holdUntil: new Date(Date.now() + 8 * 60_000),
        status: ReservationStatus.HELD,
      },
    })
  }

  const counts = {
    violations: await prisma.violation.count(),
    appeals: await prisma.appeal.count({ where: { decision: AppealDecision.PENDING } }),
    passes: await prisma.visitorPass.count(),
    unknown: await prisma.unknownVehicleLog.count(),
    sessions: await prisma.checkIn.count(),
  }

  console.info(`
Demo data ready:
  ${counts.violations} violations — 1 awaiting verification, 1 awaiting decision,
    2 upheld (same vehicle, so it shows as a repeat offender), 1 dismissed
  ${counts.appeals} appeal pending review
  ${counts.passes} visitor pass (code DEMO24AB) valid now
  ${counts.unknown} unknown-vehicle sightings, one plate seen 3 times
  ${counts.sessions} parking sessions, plus 1 live booking held by PRK001

Note: the pending appeal was decided by SEC001, so integrity rule 2 sends it
to PRK001 or ADM001 for review — that is the rule working, not a bug.
`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

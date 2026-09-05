import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import {
  AllocationType,
  Role,
  SpotType,
  UserType,
  VehicleClass,
  VehicleStatus,
  ZoneVehicleClass,
} from '../src/generated/prisma/enums'
import { randomBytes, scryptSync } from 'node:crypto'

/**
 * Development seed: a small campus that exercises every zone type.
 *
 * Deliberately mirrors a real pilot shape — one fixed staff zone, one shared
 * pool, a two-wheeler shed with no spot rows, and an event overflow lot — so
 * that booking rules, capacity-only zones, and slot assignment all have
 * something to run against.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const DEFAULT_PASSWORD = 'parqel123'

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(plain, salt, 64).toString('hex')
  return `${salt}:${derived}`
}

async function main() {
  console.info('Seeding…')

  const defaultHash = hashPassword(DEFAULT_PASSWORD)

  // Clear in FK-safe order so the seed is repeatable.
  await prisma.auditLog.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.dispatch.deleteMany()
  await prisma.alert.deleteMany()
  await prisma.appeal.deleteMany()
  await prisma.violation.deleteMany()
  await prisma.checkIn.deleteMany()
  await prisma.reservation.deleteMany()
  await prisma.unknownVehicleLog.deleteMany()
  await prisma.visitorPass.deleteMany()
  await prisma.slotAssignment.deleteMany()
  await prisma.otpChallenge.deleteMany()
  await prisma.event.deleteMany()
  await prisma.zoneEntitlement.deleteMany()
  await prisma.parkingSpot.deleteMany()
  await prisma.parkingZone.deleteMany()
  await prisma.vehicle.deleteMany()
  await prisma.userRole.deleteMany()
  await prisma.user.deleteMany()

  // ── zones ───────────────────────────────────────────────
  const staffZone = await prisma.parkingZone.create({
    data: {
      name: 'Admin Block — Staff',
      building: 'Admin Block',
      floor: 'Ground',
      allocationType: AllocationType.FIXED,
      vehicleClass: ZoneVehicleClass.FOUR_WHEELER,
      capacity: 12,
      spots: {
        create: Array.from({ length: 12 }, (_, i) => ({
          code: `A${String(i + 1).padStart(2, '0')}`,
          type: i === 0 ? SpotType.ACCESSIBLE : i < 3 ? SpotType.EV : SpotType.STANDARD,
        })),
      },
    },
  })

  const sharedZone = await prisma.parkingZone.create({
    data: {
      name: 'Main Lot — Shared',
      building: 'Main Gate',
      allocationType: AllocationType.SHARED,
      vehicleClass: ZoneVehicleClass.FOUR_WHEELER,
      capacity: 20,
      spots: {
        create: Array.from({ length: 20 }, (_, i) => ({
          code: `M${String(i + 1).padStart(2, '0')}`,
          type: i < 2 ? SpotType.VISITOR : SpotType.STANDARD,
        })),
      },
    },
  })

  // Staff-only booking, so the entitlement path is exercised by the seed.
  // Zones with no entitlement rows stay open to everyone.
  const facultyLot = await prisma.parkingZone.create({
    data: {
      name: 'Faculty Lot — Shared',
      building: 'Block B',
      allocationType: AllocationType.SHARED,
      vehicleClass: ZoneVehicleClass.FOUR_WHEELER,
      capacity: 8,
      spots: {
        create: Array.from({ length: 8 }, (_, i) => ({
          code: `F${String(i + 1).padStart(2, '0')}`,
        })),
      },
      entitlements: {
        create: [{ userType: UserType.FACULTY }, { userType: UserType.STAFF }],
      },
    },
  })

  // Capacity-only: no spot rows. Bikes do not occupy numbered slots.
  const bikeZone = await prisma.parkingZone.create({
    data: {
      name: 'Two-Wheeler Shed',
      building: 'Block C',
      allocationType: AllocationType.SHARED,
      vehicleClass: ZoneVehicleClass.TWO_WHEELER,
      capacity: 180,
    },
  })

  const eventZone = await prisma.parkingZone.create({
    data: {
      name: 'Ground Overflow',
      allocationType: AllocationType.EVENT,
      vehicleClass: ZoneVehicleClass.MIXED,
      capacity: 60,
      spots: {
        create: Array.from({ length: 10 }, (_, i) => ({
          code: `G${String(i + 1).padStart(2, '0')}`,
        })),
      },
    },
  })

  // ── people ──────────────────────────────────────────────
  const people = [
    {
      employeeId: 'ADM001',
      name: 'Priya Nair',
      email: 'priya.nair@example.edu',
      phone: '+919000000001',
      userType: UserType.STAFF,
      department: 'IT',
      // Admin-only account: roster, roles, integrations, audit.
      roles: [{ role: Role.ADMIN, scopeZoneIds: [] }],
    },
    {
      employeeId: 'EMP001',
      name: 'Priya Nair',
      email: 'priya.nair.personal@example.edu',
      phone: '+919000000011',
      userType: UserType.STAFF,
      department: 'IT',
      // Separate employee account: park, report, book, passes.
      roles: [{ role: Role.EMPLOYEE, scopeZoneIds: [] }],
    },
    {
      employeeId: 'PRK001',
      name: 'Rakesh Iyer',
      email: 'rakesh.iyer@example.edu',
      phone: '+919000000002',
      userType: UserType.STAFF,
      department: 'Facilities',
      roles: [{ role: Role.SUPERVISOR, scopeZoneIds: [] }],
    },
    {
      employeeId: 'SEC001',
      name: 'Anand Rao',
      email: 'anand.rao@example.edu',
      phone: '+919000000003',
      userType: UserType.STAFF,
      department: 'Security',
      roles: [{ role: Role.SUPERVISOR, scopeZoneIds: [] }],
    },
    {
      employeeId: 'SEC002',
      name: 'Lakshmi Devi',
      phone: '+919000000004',
      userType: UserType.CONTRACTOR,
      department: 'Security',
      // Zone-scoped guard: may only act on the main lot and the bike shed.
      roles: [{ role: Role.GUARD, scopeZoneIds: [sharedZone.id, bikeZone.id] }],
    },
    {
      employeeId: 'FAC101',
      name: 'Dr. Meera Krishnan',
      email: 'meera.k@example.edu',
      phone: '+919000000005',
      userType: UserType.FACULTY,
      department: 'Computer Science',
      roles: [{ role: Role.EMPLOYEE, scopeZoneIds: [] }],
    },
    {
      employeeId: 'STU2201',
      name: 'Arjun Menon',
      email: 'arjun.m@example.edu',
      phone: '+919000000006',
      userType: UserType.STUDENT,
      department: 'Computer Science',
      roles: [{ role: Role.EMPLOYEE, scopeZoneIds: [] }],
    },
  ]

  const created: Record<string, string> = {}

  for (const person of people) {
    const { roles, ...data } = person
    const user = await prisma.user.create({
      data: { ...data, passwordHash: defaultHash, roles: { create: roles } },
    })
    created[person.employeeId] = user.id
  }

  // ── vehicles ────────────────────────────────────────────
  // Admin holds vehicle:approve
  const approvedBy = created.ADM001

  const vehicles = [
    {
      plateNumber: 'KA05MN1234',
      vehicleClass: VehicleClass.FOUR_WHEELER,
      makeModel: 'Maruti Swift',
      userId: created.FAC101,
      status: VehicleStatus.APPROVED,
    },
    {
      plateNumber: 'KA03HH8899',
      vehicleClass: VehicleClass.TWO_WHEELER,
      makeModel: 'Honda Activa',
      userId: created.STU2201,
      status: VehicleStatus.APPROVED,
    },
    {
      plateNumber: 'KA01AB4567',
      vehicleClass: VehicleClass.FOUR_WHEELER,
      makeModel: 'Hyundai i20',
      userId: created.PRK001,
      status: VehicleStatus.APPROVED,
    },
    {
      // Sitting in the approval queue, to exercise the admin flow.
      plateNumber: 'KA51XY9090',
      vehicleClass: VehicleClass.TWO_WHEELER,
      makeModel: 'TVS Jupiter',
      userId: created.STU2201,
      status: VehicleStatus.PENDING,
    },
  ]

  for (const vehicle of vehicles) {
    await prisma.vehicle.create({
      data: {
        ...vehicle,
        ...(vehicle.status === VehicleStatus.APPROVED
          ? { approvedById: approvedBy, approvedAt: new Date() }
          : {}),
      },
    })
  }

  // ── fixed slot assignment ───────────────────────────────
  const facultySpot = await prisma.parkingSpot.findFirst({
    where: { zoneId: staffZone.id, code: 'A04' },
  })

  if (facultySpot) {
    await prisma.slotAssignment.create({
      data: {
        spotId: facultySpot.id,
        userId: created.FAC101,
        startDate: new Date('2026-06-01'),
        assignedById: created.PRK001,
      },
    })
  }

  const zoneCount = await prisma.parkingZone.count()
  const spotCount = await prisma.parkingSpot.count()
  const restricted = await prisma.parkingZone.findMany({
    where: { entitlements: { some: {} } },
    select: { name: true },
  })
  void facultyLot

  console.info(`
Seeded:
  ${people.length} users, ${vehicles.length} vehicles
  ${zoneCount} zones, ${spotCount} spots (two-wheeler shed is capacity-only)
  restricted to certain user types: ${restricted.map((z) => z.name).join(', ') || 'none'}

Sign in at /login with any employee ID below.
Default password for all users: ${DEFAULT_PASSWORD}

   ADM001    Priya Nair        Administrator (admin duties only)
   EMP001    Priya Nair        Employee (personal parking account)
   PRK001    Rakesh Iyer       Supervisor (Facilities)
   SEC001    Anand Rao         Security Supervisor
   SEC002    Lakshmi Devi      Guard (scoped to Main Lot + Bike Shed)
   FAC101    Dr. Meera K.      Employee
   STU2201   Arjun Menon       Employee (student)
`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

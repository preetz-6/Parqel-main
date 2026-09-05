import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { can, holdsPermission } from '@/server/permissions'
import {
  AlertSeverity,
  NotificationChannel,
  ReservationStatus,
  VehicleStatus,
  ViolationStatus,
} from '@/generated/prisma/enums'
import { SeverityBadge } from '@/components/status-badge'
import { AcknowledgeButton } from './acknowledge-button'
import { EmergencyAlertButton } from './emergency-alert-button'

export default async function HomePage() {
  const actor = await requireActor()

  const [alerts, vehicles, assignment, myReports, againstMe, warnings, zones, activeBooking] = await Promise.all([
    // Unacknowledged alerts about my vehicles.
    prisma.notification.findMany({
      where: {
        userId: actor.userId,
        channel: NotificationChannel.IN_APP,
        acknowledgedAt: null,
      },
      select: {
        id: true,
        createdAt: true,
        alert: {
          select: {
            severity: true,
            message: true,
            violation: {
              select: { id: true, type: true, zone: { select: { name: true } } },
            },
            vehicle: { select: { plateNumber: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.vehicle.findMany({
      where: { userId: actor.userId },
      select: { id: true, plateNumber: true, vehicleClass: true, status: true, makeModel: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.slotAssignment.findFirst({
      where: {
        userId: actor.userId,
        startDate: { lte: new Date() },
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      select: { spot: { select: { code: true, zone: { select: { name: true } } } } },
    }),
    // Reports I filed
    prisma.violation.count({ where: { reportedById: actor.userId } }),
    // Formal violations against my vehicles (APPROVED)
    prisma.violation.count({
      where: {
        matchedVehicle: { userId: actor.userId },
        status: ViolationStatus.APPROVED,
      },
    }),
    // Warnings (WARNED on-site resolutions against my vehicles — soft count)
    prisma.violation.count({
      where: {
        matchedVehicle: { userId: actor.userId },
        status: ViolationStatus.WARNED,
      },
    }),
    // Zones for the emergency alert form
    can(actor, 'alert:raise')
      ? prisma.parkingZone.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
    // Active booking (HELD — not yet checked in)
    prisma.reservation.findFirst({
      where: {
        userId: actor.userId,
        status: ReservationStatus.HELD,
        endTime: { gte: new Date() },
      },
      select: {
        holdUntil: true,
        startTime: true,
        endTime: true,
        zone: { select: { name: true } },
        spot: { select: { code: true } },
        vehicle: { select: { plateNumber: true } },
      },
      orderBy: { startTime: 'asc' },
    }),
  ])

  const showReport = holdsPermission(actor, 'violation:report')
  const showEmergency = can(actor, 'alert:raise')

  // Time-aware greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = actor.name.split(' ')[0]

  return (
    <>
      {/* ── Greeting ────────────────────────────────────────────── */}
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
        {greeting}, {firstName}
      </h1>
      <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
        {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      <div className="mt-5" />
      {/* ── Report a violation — always visible at top ──────────── */}
      {showReport && (
        <Link
          href="/report"
          className="flex items-center justify-between rounded-xl bg-neutral-900 p-4 text-white transition-colors hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <div>
            <span className="block text-sm font-semibold">Report a violation</span>
            <span className="mt-0.5 block text-xs opacity-70">
              Photo and plate — security verifies it
            </span>
          </div>
          <svg className="h-5 w-5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {/* ── Emergency alert ─────────────────────────────────────── */}
      {showEmergency && zones.length > 0 && (
        <EmergencyAlertButton zones={zones} vehicles={vehicles} />
      )}

      {/* ── Active booking ──────────────────────────────────────── */}
      {activeBooking && (
        <section className="mt-6">
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  Active booking
                </h2>
                <p className="mt-1 text-sm text-blue-800 dark:text-blue-200">
                  {activeBooking.zone.name}
                  {activeBooking.spot && (
                    <span className="font-mono"> · {activeBooking.spot.code}</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-blue-600/80 dark:text-blue-300/70">
                  {activeBooking.vehicle.plateNumber} ·{' '}
                  {activeBooking.startTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {activeBooking.endTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-medium uppercase tracking-wider text-blue-500 dark:text-blue-400">
                  Check in by
                </p>
                <p className="mt-0.5 font-mono text-lg font-semibold text-blue-900 dark:text-blue-100">
                  {activeBooking.holdUntil.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <Link
              href="/parking"
              className="mt-3 inline-block text-xs font-medium text-blue-700 underline underline-offset-2 dark:text-blue-300"
            >
              Go to parking →
            </Link>
          </div>
        </section>
      )}

      {/* ── Unacknowledged alerts ───────────────────────────────── */}
      {alerts.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Alerts
          </h2>
          {alerts.map((notification) => (
            <div
              key={notification.id}
              className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30"
            >
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={notification.alert.severity} />
                <span className="font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {notification.alert.vehicle?.plateNumber}
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-800 dark:text-neutral-200">
                {notification.alert.message}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <AcknowledgeButton notificationId={notification.id} />
                {notification.alert.violation && (
                  <Link
                    href={`/violations/${notification.alert.violation.id}`}
                    className="text-sm text-neutral-600 underline underline-offset-2 dark:text-neutral-300"
                  >
                    See the report
                  </Link>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── My vehicles ────────────────────────────────────────── */}
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            My vehicles
          </h2>
          <Link
            href="/vehicles"
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Manage →
          </Link>
        </div>
        <div className="mt-2 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          {vehicles.length === 0 ? (
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              No vehicles registered.{' '}
              <Link href="/vehicles" className="underline underline-offset-2">
                Add one
              </Link>
            </p>
          ) : (
            <ul className="space-y-2">
              {vehicles.map((vehicle) => (
                <li key={vehicle.id} className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-mono text-sm text-neutral-900 dark:text-neutral-100">
                      {vehicle.plateNumber}
                    </span>
                    {vehicle.makeModel && (
                      <span className="ml-2 text-xs text-neutral-500">{vehicle.makeModel}</span>
                    )}
                  </span>
                  {vehicle.status !== VehicleStatus.APPROVED && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      {vehicle.status.toLowerCase()}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Parking status ─────────────────────────────────────── */}
      <section className="mt-6">
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Parking status
        </h2>
        <div className="mt-2 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          {assignment ? (
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              <span className="font-mono text-lg">{assignment.spot.code}</span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                {assignment.spot.zone.name}
              </span>
            </p>
          ) : (
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              No assigned slot. Shared zones are first come, first served.
            </p>
          )}
        </div>
      </section>

      {/* ── Violation summary ──────────────────────────────────── */}
      <section className="mt-6">
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Violation summary
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <SummaryCard label="Reports filed" value={myReports} />
          <SummaryCard label="Formal violations" value={againstMe} warn={againstMe > 0} />
          <SummaryCard label="Warnings" value={warnings} />
        </div>
      </section>
    </>
  )
}

function SummaryCard({
  label,
  value,
  warn,
}: {
  label: string
  value: number
  warn?: boolean
}) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <p
        className={`text-xl font-semibold tabular-nums ${
          warn
            ? 'text-red-600 dark:text-red-400'
            : 'text-neutral-900 dark:text-neutral-50'
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
    </div>
  )
}

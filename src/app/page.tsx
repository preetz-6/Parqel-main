import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { activeRoles, can, holdsPermission, scopedZoneIds } from '@/server/permissions'
import {
  NotificationChannel,
  PassStatus,
  VehicleStatus,
  ViolationStatus,
} from '@/generated/prisma/enums'
import { SeverityBadge } from '@/components/status-badge'
import { AcknowledgeButton } from './acknowledge-button'

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: 'Employee',
  GUARD: 'Guard',
  SUPERVISOR: 'Security Supervisor',
  PARKING_ADMIN: 'Parking Admin',
  ADMIN: 'Administrator',
}

export default async function HomePage() {
  const actor = await requireActor()

  // Admin-level users land directly on the admin dashboard.
  const isAdmin =
    holdsPermission(actor, 'import:csv') ||
    holdsPermission(actor, 'zone:write') ||
    holdsPermission(actor, 'user:manage')
  if (isAdmin) redirect('/admin')

  const roles = activeRoles(actor)
  const scope = scopedZoneIds(actor)

  const [alerts, vehicles, assignment, myReports, queueCount, activePasses] = await Promise.all([
    // Alerts about my vehicles that I have not acknowledged.
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
    prisma.violation.count({ where: { reportedById: actor.userId } }),
    holdsPermission(actor, 'violation:triage')
      ? prisma.violation.count({
          where: {
            status: { in: [ViolationStatus.SUBMITTED, ViolationStatus.TRIAGED] },
            ...(scope === null ? {} : { zoneId: { in: scope } }),
          },
        })
      : Promise.resolve(0),
    prisma.visitorPass.count({
      where: {
        OR: [{ issuedById: actor.userId }, { hostUserId: actor.userId }],
        status: { not: PassStatus.REVOKED },
        validTo: { gte: new Date() },
      },
    }),
  ])

  // Nav visibility asks "could this person ever"; the zone-aware check happens
  // when they actually act on a specific violation or zone.
  const showQueue = holdsPermission(actor, 'violation:triage')
  const showReport = holdsPermission(actor, 'violation:report')
  const showParking = holdsPermission(actor, 'reservation:create')
  const showPersonal = holdsPermission(actor, 'vehicle:request') || vehicles.length > 0

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
            {actor.name}
          </h1>
          <p className="mt-0.5 font-mono text-sm text-neutral-500 dark:text-neutral-400">
            {actor.employeeId}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {roles.map((role) => (
              <span
                key={role.role}
                className="rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                {ROLE_LABELS[role.role] ?? role.role}
                {role.scopeZoneIds.length > 0 && ` · ${role.scopeZoneIds.length} zone(s)`}
              </span>
            ))}
          </div>
        </div>

        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Sign out
          </button>
        </form>
      </header>

      {alerts.length > 0 && (
        <section className="mt-6 space-y-3">
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

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        {showReport && (
          <Action
            href="/report"
            title="Report a vehicle"
            detail="Photo and plate — security verifies it"
            primary
          />
        )}
        {showQueue && (
          <Action
            href="/security"
            title="Security queue"
            detail={
              queueCount === 0
                ? 'Nothing waiting'
                : `${queueCount} item${queueCount === 1 ? '' : 's'} waiting`
            }
          />
        )}
        {showParking && (
          <Action
            href="/parking"
            title="Find parking"
            detail="Live availability and booking"
          />
        )}
        {showReport && (
          <Action
            href="/violations"
            title="My reports"
            detail={myReports === 0 ? 'None filed' : `${myReports} filed`}
          />
        )}
        {can(actor, 'pass:issue') && (
          <Action
            href="/passes"
            title="Visitor passes"
            detail={
              activePasses === 0
                ? 'Invite a guest'
                : `${activePasses} active pass${activePasses === 1 ? '' : 'es'}`
            }
          />
        )}
      </section>

      {showPersonal && (
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Panel title="My vehicles">
          {vehicles.length === 0 ? (
            <Empty>No vehicles registered. Ask the parking office to add yours.</Empty>
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
        </Panel>

        <Panel title="My parking slot">
          {assignment ? (
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              <span className="font-mono text-lg">{assignment.spot.code}</span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                {assignment.spot.zone.name}
              </span>
            </p>
          ) : (
            <Empty>No assigned slot. Shared zones are first come, first served.</Empty>
          )}
        </Panel>
      </section>
      )}
    </main>
  )
}

function Action({
  href,
  title,
  detail,
  primary,
}: {
  href: string
  title: string
  detail: string
  primary?: boolean
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? 'rounded-xl bg-neutral-900 p-4 text-white dark:bg-neutral-100 dark:text-neutral-900'
          : 'rounded-xl border border-neutral-200 p-4 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900'
      }
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className={`mt-0.5 block text-xs ${primary ? 'opacity-70' : 'text-neutral-500'}`}>
        {detail}
      </span>
    </Link>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">{title}</h2>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-neutral-400 dark:text-neutral-500">{children}</p>
}

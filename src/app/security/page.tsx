import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { scopedZoneIds } from '@/server/permissions'
import { ViolationStatus } from '@/generated/prisma/enums'
import { StatusBadge, VIOLATION_LABELS } from '@/components/status-badge'

export default async function SecurityQueuePage() {
  const actor = await requireActor()
  const scope = scopedZoneIds(actor)

  const violations = await prisma.violation.findMany({
    where: {
      status: { in: [ViolationStatus.SUBMITTED, ViolationStatus.TRIAGED] },
      ...(scope === null ? {} : { zoneId: { in: scope } }),
    },
    select: {
      id: true,
      type: true,
      status: true,
      plateEntered: true,
      createdAt: true,
      reportedById: true,
      zone: { select: { name: true } },
      reportedBy: { select: { name: true, employeeId: true } },
      matchedVehicle: { select: { plateNumber: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    take: 100,
  })

  const awaitingTriage = violations.filter((v) => v.status === ViolationStatus.SUBMITTED)
  const awaitingDecision = violations.filter((v) => v.status === ViolationStatus.TRIAGED)

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          Security queue
        </h1>
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
          {scope === null
            ? 'All zones'
            : `${scope.length} zone${scope.length === 1 ? '' : 's'} in your scope`}
        </p>
      </div>

      <Section
        title="Awaiting verification"
        empty="Nothing waiting to be verified."
        violations={awaitingTriage}
        actorId={actor.userId}
      />

      <Section
        title="Awaiting decision"
        empty="Nothing waiting on a decision."
        violations={awaitingDecision}
        actorId={actor.userId}
      />
    </>
  )
}

type Row = {
  id: string
  type: string
  status: ViolationStatus
  plateEntered: string | null
  createdAt: Date
  reportedById: string
  zone: { name: string }
  reportedBy: { name: string; employeeId: string }
  matchedVehicle: { plateNumber: string } | null
}

function Section({
  title,
  empty,
  violations,
  actorId,
}: {
  title: string
  empty: string
  violations: Row[]
  actorId: string
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {title}
        <span className="ml-2 tabular-nums text-neutral-400">{violations.length}</span>
      </h2>

      {violations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {violations.map((violation) => {
            const isOwnReport = violation.reportedById === actorId
            return (
              <li key={violation.id}>
                <Link
                  href={`/security/${violation.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {violation.matchedVehicle?.plateNumber ?? violation.plateEntered}
                      </span>
                      <StatusBadge status={violation.status} />
                      {isOwnReport && (
                        // Surfaced early so a reviewer does not open it, work
                        // through the match, and only then hit rule 1.
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                          Your report
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
                      {VIOLATION_LABELS[violation.type] ?? violation.type} · {violation.zone.name}
                    </p>
                  </div>
                  <time
                    dateTime={violation.createdAt.toISOString()}
                    className="shrink-0 text-xs text-neutral-400"
                  >
                    {violation.createdAt.toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { StatusBadge, VIOLATION_LABELS } from '@/components/status-badge'
import { ReportsFilter } from './reports-filter'

export default async function ReportsPage(props: { searchParams: Promise<{ filter?: string }> }) {
  const actor = await requireActor()
  const { filter } = await props.searchParams
  const showAgainst = filter === 'against'

  const [filed, against] = await Promise.all([
    prisma.violation.findMany({
      where: { reportedById: actor.userId },
      select: {
        id: true,
        type: true,
        status: true,
        plateEntered: true,
        createdAt: true,
        zone: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.violation.findMany({
      where: {
        matchedVehicle: { userId: actor.userId },
        status: { in: ['APPROVED', 'WARNED', 'VOIDED'] },
      },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        zone: { select: { name: true } },
        matchedVehicle: { select: { plateNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  const items = showAgainst ? against : filed

  return (
    <>
      <ReportsFilter current={showAgainst ? 'against' : 'mine'} />

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
          {showAgainst
            ? 'Nothing recorded against your vehicles.'
            : 'You have not reported anything yet.'}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((violation) => (
            <li key={violation.id}>
              <Link
                href={`/violations/${violation.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {'plateEntered' in violation
                        ? (violation.plateEntered ?? '—')
                        : (violation.matchedVehicle?.plateNumber ?? '—')}
                    </span>
                    <StatusBadge status={violation.status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
                    {VIOLATION_LABELS[violation.type] ?? violation.type} · {violation.zone.name}
                  </p>
                </div>
                <time dateTime={violation.createdAt.toISOString()} className="shrink-0 text-xs text-neutral-400">
                  {violation.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

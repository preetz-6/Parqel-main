import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { VIOLATION_LABELS } from '@/components/status-badge'
import { AppealsFilter } from './appeals-filter'

export default async function AppealsPage(props: { searchParams: Promise<{ filter?: string }> }) {
  const actor = await requireActor()
  const { filter } = await props.searchParams
  const showResolved = filter === 'resolved'

  // Appeals on violations against my vehicles.
  const appeals = await prisma.appeal.findMany({
    where: {
      violation: { matchedVehicle: { userId: actor.userId } },
      ...(showResolved
        ? { decision: { not: 'PENDING' } }
        : { decision: 'PENDING' }),
    },
    select: {
      id: true,
      reason: true,
      decision: true,
      createdAt: true,
      violation: {
        select: {
          id: true,
          type: true,
          zone: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const DECISION_LABELS: Record<string, string> = {
    PENDING: 'Under review',
    UPHELD: 'Upheld',
    OVERTURNED: 'Overturned',
  }

  return (
    <>
      <AppealsFilter current={showResolved ? 'resolved' : 'pending'} />

      {appeals.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
          {showResolved ? 'No resolved appeals.' : 'No pending appeals.'}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {appeals.map((appeal) => (
            <li key={appeal.id}>
              <Link
                href={`/violations/${appeal.violation.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {VIOLATION_LABELS[appeal.violation.type] ?? appeal.violation.type}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        appeal.decision === 'PENDING'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : appeal.decision === 'OVERTURNED'
                            ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                            : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                      }`}
                    >
                      {DECISION_LABELS[appeal.decision] ?? appeal.decision}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
                    {appeal.reason.length > 80
                      ? `${appeal.reason.slice(0, 80)}…`
                      : appeal.reason}
                  </p>
                </div>
                <time
                  dateTime={appeal.createdAt.toISOString()}
                  className="shrink-0 text-xs text-neutral-400"
                >
                  {appeal.createdAt.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

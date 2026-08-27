import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { currentCan, requireActor } from '@/server/dal'
import { AppealDecision } from '@/generated/prisma/enums'
import { VIOLATION_LABELS } from '@/components/status-badge'
import { ReviewAppealPanel } from './review-panel'

export default async function AppealsPage() {
  const actor = await requireActor()
  if (!(await currentCan('appeal:review'))) redirect('/admin')

  const appeals = await prisma.appeal.findMany({
    where: { decision: AppealDecision.PENDING },
    select: {
      id: true,
      reason: true,
      createdAt: true,
      user: { select: { name: true, employeeId: true } },
      violation: {
        select: {
          id: true,
          type: true,
          status: true,
          decidedById: true,
          reportedById: true,
          createdAt: true,
          zone: { select: { name: true } },
          matchedVehicle: { select: { plateNumber: true } },
          decidedBy: { select: { name: true, employeeId: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <main className="py-6">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Appeals</h1>
      <p className="mt-1 max-w-prose text-sm text-neutral-500 dark:text-neutral-400">
        Overturning an appeal voids the violation — the record stays, with the
        reason attached. You cannot review an appeal against a decision you
        made yourself.
      </p>

      {appeals.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-400 dark:border-neutral-700">
          No appeals waiting.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {appeals.map((appeal) => {
            // Rule 2 blocks this server-side too; showing it here saves the
            // reviewer reading the whole case before being refused.
            const blockedReason =
              appeal.violation.decidedById === actor.userId
                ? 'You decided this violation, so you cannot review its appeal.'
                : appeal.violation.reportedById === actor.userId
                  ? 'You reported this violation, so you cannot review its appeal.'
                  : null

            return (
              <li
                key={appeal.id}
                className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {appeal.violation.matchedVehicle?.plateNumber ?? '—'}
                  </span>
                  <time className="text-xs text-neutral-400">
                    {appeal.createdAt.toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                </div>

                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  {VIOLATION_LABELS[appeal.violation.type] ?? appeal.violation.type} ·{' '}
                  {appeal.violation.zone.name}
                </p>

                <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                  Appealed by {appeal.user.name} ({appeal.user.employeeId}) · originally decided by{' '}
                  {appeal.violation.decidedBy
                    ? `${appeal.violation.decidedBy.name} (${appeal.violation.decidedBy.employeeId})`
                    : 'unknown'}
                </p>

                <blockquote className="mt-3 border-l-2 border-neutral-200 pl-3 text-sm text-neutral-800 dark:border-neutral-700 dark:text-neutral-200">
                  {appeal.reason}
                </blockquote>

                {/* eslint-disable-next-line @next/next/no-img-element -- authorized dynamic route */}
                <img
                  src={`/api/violations/${appeal.violation.id}/image`}
                  alt="Evidence"
                  className="mt-4 max-h-64 w-full rounded-lg border border-neutral-200 object-contain dark:border-neutral-800"
                />

                {blockedReason ? (
                  <p className="mt-4 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {blockedReason} Escalate it to an administrator.
                  </p>
                ) : (
                  <ReviewAppealPanel appealId={appeal.id} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

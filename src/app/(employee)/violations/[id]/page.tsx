import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { canViewViolation } from '@/server/violations/access'
import { ViolationStatus } from '@/generated/prisma/enums'
import { StatusBadge, VIOLATION_LABELS } from '@/components/status-badge'
import { AppealForm } from './appeal-form'

export default async function ViolationDetailPage(props: { params: Promise<{ id: string }> }) {
  const actor = await requireActor()
  const { id } = await props.params

  const violation = await prisma.violation.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      plateEntered: true,
      note: true,
      createdAt: true,
      decidedAt: true,
      voidReason: true,
      reportedById: true,
      zoneId: true,
      zone: { select: { name: true, building: true } },
      matchedVehicle: { select: { userId: true, plateNumber: true } },
      appeals: {
        select: { id: true, reason: true, decision: true, reviewNote: true, createdAt: true },
      },
    },
  })

  if (!violation || !canViewViolation(actor, violation)) notFound()

  const isAccused = violation.matchedVehicle?.userId === actor.userId
  const isReporter = violation.reportedById === actor.userId
  const canAppeal =
    isAccused && violation.status === ViolationStatus.APPROVED && violation.appeals.length === 0

  return (
    <>
      <Link
        href="/violations"
        className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        ← Reports & Appeals
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            {VIOLATION_LABELS[violation.type] ?? violation.type}
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            {violation.zone.name}
            {violation.zone.building ? ` — ${violation.zone.building}` : ''} ·{' '}
            {violation.createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <StatusBadge status={violation.status} />
      </header>

      {isAccused && (
        <p className="mt-4 rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
          This was recorded against{' '}
          <span className="font-mono">{violation.matchedVehicle?.plateNumber}</span>. If you believe
          it is wrong, you can appeal — it will be reviewed by someone other than the person who
          decided it.
        </p>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element -- authorized dynamic route */}
      <img
        src={`/api/violations/${violation.id}/image`}
        alt="Evidence photo"
        className="mt-5 max-h-96 w-full rounded-xl border border-neutral-200 object-contain dark:border-neutral-800"
      />

      {violation.note && (
        <p className="mt-4 rounded-xl border border-neutral-200 p-4 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
          {violation.note}
        </p>
      )}

      {violation.voidReason && (
        <p className="mt-4 rounded-xl border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800">
          Voided: {violation.voidReason}
        </p>
      )}

      {violation.appeals.map((appeal) => (
        <div
          key={appeal.id}
          className="mt-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Appeal — {appeal.decision === 'PENDING' ? 'under review' : appeal.decision.toLowerCase()}
          </h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{appeal.reason}</p>
          {appeal.reviewNote && (
            <p className="mt-3 border-t border-neutral-100 pt-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
              <span className="text-neutral-400">Reviewer:</span> {appeal.reviewNote}
            </p>
          )}
        </div>
      ))}

      {canAppeal && <AppealForm violationId={violation.id} />}

      {isReporter && violation.status === ViolationStatus.SUBMITTED && (
        <p className="mt-5 text-sm text-neutral-500 dark:text-neutral-400">
          Security has not reviewed this yet.
        </p>
      )}
    </>
  )
}

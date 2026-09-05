import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { canViewViolation } from '@/server/violations/access'
import { StatusBadge, VIOLATION_LABELS } from '@/components/status-badge'

export default async function ReportConfirmationPage(props: { params: Promise<{ id: string }> }) {
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
      reportedById: true,
      zoneId: true,
      zone: { select: { name: true } },
      matchedVehicle: { select: { userId: true } },
    },
  })

  if (!violation || !canViewViolation(actor, violation)) notFound()

  return (
    <>
      <div className="rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              Report filed
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Security will verify it before the owner is contacted.
            </p>
          </div>
          <StatusBadge status={violation.status} />
        </div>

        <dl className="mt-6 space-y-3 border-t border-neutral-100 pt-5 text-sm dark:border-neutral-800">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500 dark:text-neutral-400">Issue</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">
              {VIOLATION_LABELS[violation.type] ?? violation.type}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500 dark:text-neutral-400">Plate reported</dt>
            <dd className="font-mono text-neutral-900 dark:text-neutral-100">
              {violation.plateEntered}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500 dark:text-neutral-400">Where</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{violation.zone.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500 dark:text-neutral-400">Filed</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">
              {violation.createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </dd>
          </div>
        </dl>

        {/* Evidence is served through an authorized route, never from /public. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- authorized dynamic route, not optimisable */}
        <img
          src={`/api/violations/${violation.id}/image`}
          alt="Evidence photo"
          className="mt-5 max-h-72 w-full rounded-lg border border-neutral-200 object-contain dark:border-neutral-800"
        />
      </div>

      <div className="mt-4 flex gap-3">
        <Link
          href="/"
          className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Done
        </Link>
        <Link
          href="/report"
          className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Report another
        </Link>
      </div>
    </>
  )
}

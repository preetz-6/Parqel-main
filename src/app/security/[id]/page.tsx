import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { can } from '@/server/permissions'
import { canViewViolation } from '@/server/violations/access'
import { findPlateCandidates } from '@/server/violations/plate-match'
import { ViolationStatus } from '@/generated/prisma/enums'
import { StatusBadge, VIOLATION_LABELS } from '@/components/status-badge'
import { ReviewPanel } from './review-panel'

export default async function SecurityDetailPage(props: PageProps<'/security/[id]'>) {
  const actor = await requireActor()
  const { id } = await props.params

  const violation = await prisma.violation.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      plateEntered: true,
      ocrPlate: true,
      ocrConfidence: true,
      note: true,
      createdAt: true,
      reportedById: true,
      zoneId: true,
      matchedVehicleId: true,
      voidReason: true,
      zone: { select: { name: true, building: true } },
      reportedBy: { select: { name: true, employeeId: true } },
      triagedBy: { select: { name: true, employeeId: true } },
      decidedBy: { select: { name: true, employeeId: true } },
      matchedVehicle: {
        select: { userId: true, plateNumber: true, owner: { select: { name: true, employeeId: true } } },
      },
    },
  })

  if (!violation || !canViewViolation(actor, violation)) notFound()

  const mayTriage = can(actor, 'violation:triage', { zoneId: violation.zoneId })
  const mayDecide = can(actor, 'violation:decide', { zoneId: violation.zoneId })

  // Rule 1 lives in the service; the UI just explains it up front rather than
  // letting someone do the work and then be refused.
  const isOwnReport = violation.reportedById === actor.userId

  // Search the registry from both the typed plate and the OCR reading. When
  // they disagree, one of them is usually right — offering candidates from
  // only one would hide the correct vehicle behind somebody's typo.
  const queries = [...new Set([violation.plateEntered, violation.ocrPlate].filter(Boolean))]

  const candidates =
    mayTriage && violation.status === ViolationStatus.SUBMITTED && queries.length > 0
      ? dedupeCandidates(
          (await Promise.all(queries.map((plate) => findPlateCandidates(plate!)))).flat(),
        )
      : []

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <Link
        href="/security"
        className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        ← Queue
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

      {/* eslint-disable-next-line @next/next/no-img-element -- authorized dynamic route */}
      <img
        src={`/api/violations/${violation.id}/image`}
        alt="Evidence photo"
        className="mt-5 max-h-96 w-full rounded-xl border border-neutral-200 object-contain dark:border-neutral-800"
      />

      <dl className="mt-5 space-y-3 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        <Row label="Plate reported">
          <span className="font-mono">{violation.plateEntered}</span>
        </Row>
        {violation.ocrPlate && (
          <Row label="Read from photo">
            <span className="font-mono">{violation.ocrPlate}</span>
            {violation.ocrConfidence !== null && (
              <span className="text-neutral-500">
                {' '}
                · {Math.round(violation.ocrConfidence * 100)}% confident
              </span>
            )}
            {/* Flagged explicitly: a mismatch is the case most likely to send
                an alert to the wrong person, so it must not be skimmed past. */}
            {violation.ocrPlate !== violation.plateEntered && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                differs from what was typed
              </span>
            )}
          </Row>
        )}
        <Row label="Reported by">
          {violation.reportedBy.name}{' '}
          <span className="font-mono text-xs text-neutral-400">
            {violation.reportedBy.employeeId}
          </span>
        </Row>
        {violation.matchedVehicle && (
          <Row label="Matched vehicle">
            <span className="font-mono">{violation.matchedVehicle.plateNumber}</span>
            <span className="text-neutral-500"> · {violation.matchedVehicle.owner.name}</span>
          </Row>
        )}
        {violation.note && <Row label="Note">{violation.note}</Row>}
        {violation.triagedBy && <Row label="Verified by">{violation.triagedBy.name}</Row>}
        {violation.decidedBy && <Row label="Decided by">{violation.decidedBy.name}</Row>}
        {violation.voidReason && <Row label="Void reason">{violation.voidReason}</Row>}
      </dl>

      <ReviewPanel
        violationId={violation.id}
        status={violation.status}
        matchedVehicleId={violation.matchedVehicleId}
        candidates={candidates}
        mayTriage={mayTriage}
        mayDecide={mayDecide}
        isOwnReport={isOwnReport}
      />
    </main>
  )
}

/**
 * Same vehicle can surface from both the typed plate and the OCR reading.
 * Keep the higher-confidence sighting of each.
 */
function dedupeCandidates<T extends { vehicleId: string; confidence: number }>(
  candidates: T[],
): T[] {
  const best = new Map<string, T>()

  for (const candidate of candidates) {
    const existing = best.get(candidate.vehicleId)
    if (!existing || candidate.confidence > existing.confidence) {
      best.set(candidate.vehicleId, candidate)
    }
  }

  return [...best.values()].sort((a, b) => b.confidence - a.confidence)
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="text-right text-neutral-900 dark:text-neutral-100">{children}</dd>
    </div>
  )
}

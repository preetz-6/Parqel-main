import type { ViolationStatus } from '@/generated/prisma/enums'

const STYLES: Record<ViolationStatus, { label: string; className: string }> = {
  SUBMITTED: {
    label: 'Awaiting review',
    className:
      'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
  },
  TRIAGED: {
    label: 'Verified â€” awaiting decision',
    className:
      'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900',
  },
  WARNED: {
    label: 'Warned on-site',
    className:
      'bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800',
  },
  APPROVED: {
    label: 'Upheld',
    className:
      'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
  },
  REJECTED: {
    label: 'Dismissed',
    className:
      'bg-neutral-100 text-neutral-600 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700',
  },
  VOIDED: {
    label: 'Voided',
    className:
      'bg-neutral-100 text-neutral-500 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-700',
  },
}

export function StatusBadge({ status }: { status: ViolationStatus }) {
  const style = STYLES[status]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}
    >
      {style.label}
    </span>
  )
}

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-amber-400 text-neutral-900',
  LOW: 'bg-neutral-300 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100',
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.LOW
      }`}
    >
      {severity}
    </span>
  )
}

export const VIOLATION_LABELS: Record<string, string> = {
  BLOCKING: 'Blocking a vehicle',
  WRONG_SLOT: 'Wrong slot',
  FIRE_LANE: 'Blocking a fire lane',
  DOUBLE_PARK: 'Double parked',
  NO_PERMIT: 'No permit',
  OTHER: 'Other',
}

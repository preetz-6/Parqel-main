'use client'

import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Toggle between "Reported by me" and "Against me" filter on the reports page.
 */
export function ReportsFilter({ current }: { current: 'mine' | 'against' }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function toggle(value: 'mine' | 'against') {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'against') {
      params.set('filter', 'against')
    } else {
      params.delete('filter')
    }
    router.push(`/violations?${params.toString()}`)
  }

  return (
    <div className="flex gap-2">
      <FilterButton active={current === 'mine'} onClick={() => toggle('mine')}>
        Reported by me
      </FilterButton>
      <FilterButton active={current === 'against'} onClick={() => toggle('against')}>
        Against me
      </FilterButton>
    </div>
  )
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900'
          : 'rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
      }
    >
      {children}
    </button>
  )
}

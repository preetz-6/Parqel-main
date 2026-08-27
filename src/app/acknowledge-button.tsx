'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AcknowledgeButton({ notificationId }: { notificationId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function acknowledge() {
    setPending(true)
    await fetch(`/api/notifications/${notificationId}/acknowledge`, { method: 'POST' })
    setPending(false)
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={acknowledge}
      disabled={pending}
      className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
    >
      {pending ? 'Saving…' : "I'm on it"}
    </button>
  )
}

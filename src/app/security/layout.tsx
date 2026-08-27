import { redirect } from 'next/navigation'
import { requireActor } from '@/server/dal'
import { holdsPermission } from '@/server/permissions'
import { AdminSidebar } from '@/components/admin-sidebar'

export default async function SecurityLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor()

  // Page-level gate: the security section is for people who can triage.
  if (!holdsPermission(actor, 'violation:triage')) redirect('/')

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AdminSidebar actor={actor} variant="security" />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  )
}

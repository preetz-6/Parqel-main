import { redirect } from 'next/navigation'
import { requireActor } from '@/server/dal'
import { holdsPermission, type Permission } from '@/server/permissions'
import { AdminSidebar } from '@/components/admin-sidebar'

/**
 * Permissions that grant access to at least one admin sub-page. If a user
 * holds none of these, redirect them home rather than showing an empty shell.
 */
const GATE_PERMISSIONS: Permission[] = [
  'import:csv',
  'appeal:review',
  'event:create',
  'analytics:read',
  'audit:read',
  'audit:read:parking',
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor()

  // If the user can't reach any admin sub-page, send them home.
  const hasAccess = GATE_PERMISSIONS.some((permission) => holdsPermission(actor, permission))
  if (!hasAccess) redirect('/')

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AdminSidebar actor={actor} variant="admin" />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  )
}


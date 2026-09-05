import Link from 'next/link'

/**
 * Shared layout for the Reports & Appeals section.
 * Renders tab navigation at the top and the active sub-page below.
 */
export default function ViolationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Reports & Appeals
      </h1>

      {/* Tab navigation */}
      <nav className="mt-4 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        <TabLink href="/violations">Reports</TabLink>
        <TabLink href="/violations/appeals">Appeals</TabLink>
      </nav>

      <div className="mt-4">
        {children}
      </div>
    </>
  )
}

function TabLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="relative -mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
    >
      {children}
    </Link>
  )
}

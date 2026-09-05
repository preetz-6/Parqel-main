'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'

/**
 * Mobile sidebar shell — hamburger button that slides open a full nav panel.
 *
 * Automatically closes when the user navigates (pathname changes). The desktop
 * sidebar is untouched — this only renders below md breakpoint.
 */
export function MobileSidebarToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on navigation
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      {/* Hamburger button — always visible on mobile */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-lg border border-neutral-200 p-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-out panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-neutral-50 shadow-xl transition-transform duration-200 ease-out md:hidden dark:bg-neutral-950 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col overflow-y-auto">
          {/* Close button inside panel */}
          <div className="flex items-center justify-end px-4 pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </>
  )
}

import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { refreshSession } from '@/server/session'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Parqel',
  description: 'Campus parking accountability',
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Sliding session expiry: re-signs the JWT when it is past the halfway mark
  // of its 12h TTL. Does nothing for signed-out visitors or fresh sessions.
  await refreshSession()

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}


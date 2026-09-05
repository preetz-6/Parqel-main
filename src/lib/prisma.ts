import 'server-only'

// Force IPv4-first DNS resolution. Supabase's pooler advertises both IPv6 and
// IPv4, but the IPv6 addresses have no route from most residential/campus
// networks. Without this, Node hangs 12-25 seconds on IPv6 before falling back
// to IPv4 — long enough for Supabase to close the connection (P1001/P1017).
import dns from 'node:dns'
dns.setDefaultResultOrder('ipv4first')

import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

// Prisma 7 requires a driver adapter for SQL providers — there is no bundled
// engine binary any more.
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.')
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function createClient() {
  const pool = new pg.Pool({
    connectionString,
    // Keep TCP connections alive so Supabase's pooler doesn't silently drop
    // idle sockets mid-request.
    keepAlive: true,
    // Serverless: each function instance gets its own pool. Supabase's
    // PgBouncer limits session-mode connections to pool_size (default 15).
    // With multiple Vercel instances, 5 × N easily exceeds that. Use 2.
    max: 2,
    // Release idle connections quickly — serverless functions are short-lived.
    idleTimeoutMillis: 10_000,
    // Don't wait forever for a connection from the pool.
    connectionTimeoutMillis: 10_000,
  })

  return new PrismaClient({
    adapter: new PrismaPg(pool),
  })
}

// Reuse the client across hot reloads in dev so we don't exhaust the pool.
export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}


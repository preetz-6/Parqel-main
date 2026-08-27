import 'server-only'

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
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  })
}

// Reuse the client across hot reloads in dev so we don't exhaust the pool.
export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

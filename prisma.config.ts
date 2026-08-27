import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Prisma 7 moved configuration out of schema.prisma and stopped loading .env
 * automatically, hence the dotenv import above.
 *
 * SHADOW_DATABASE_URL matters locally. `npx prisma dev` serves a single logical
 * database and ignores the database name in the URL, so Prisma cannot create a
 * throwaway shadow database on the main port — `migrate dev` fails with "type
 * already exists" while replaying migrations. The dev server exposes a separate
 * shadow instance on its own port (default 51215); pointing at it explicitly is
 * what makes migrations work.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
    ...(process.env['SHADOW_DATABASE_URL']
      ? { shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'] }
      : {}),
  },
})

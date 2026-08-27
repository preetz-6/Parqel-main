import 'server-only'

import { headers } from 'next/headers'

/** Best-effort client IP for the audit trail. Never used for authorization. */
export async function clientIp(): Promise<string | null> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return h.get('x-real-ip')
}

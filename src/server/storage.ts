import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

/**
 * Evidence storage.
 *
 * Violation photos show number plates, vehicles and sometimes people. They are
 * evidence in a process that can end in a penalty, so they are **never** served
 * from /public — every read goes through an authorization check tied to the
 * violation the image belongs to (see src/server/violations/access.ts).
 *
 * Production: Supabase Storage (bucket: "evidence", private).
 * Dev fallback: local .uploads/ directory if SUPABASE_URL is unset.
 *
 * The interface is deliberately simple — `storeEvidence` / `readEvidence` —
 * so swapping providers is a driver change, not a refactor.
 */

const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

const MAX_BYTES = 8 * 1024 * 1024

export type StoredFile = {
  key: string
  contentType: string
  bytes: number
  sha256: string
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadError'
  }
}

/**
 * Validates by sniffing magic bytes, not by trusting the declared MIME type.
 * A client can claim anything; the file header is harder to lie about.
 */
function sniffContentType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }

  // WEBP: "RIFF" .... "WEBP"
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }

  return null
}

/* ------------------------------------------------------------------ */
/* Supabase Storage driver                                            */
/* ------------------------------------------------------------------ */

const BUCKET = 'evidence'

function getSupabaseClient() {
  // Lazy import to avoid pulling the SDK into the bundle when unused.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js')

  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

async function supabaseStore(buffer: Buffer, key: string, contentType: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType,
    upsert: false, // fail if key already exists — keys are UUID-based so this should never collide
  })
  if (error) throw new UploadError(`Storage upload failed: ${error.message}`)
}

async function supabaseRead(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.storage.from(BUCKET).download(key)
  if (error || !data) return null

  const arrayBuf = await data.arrayBuffer()
  const body = Buffer.from(arrayBuf)

  // Derive content type from extension since Supabase doesn't always return it.
  const ext = key.split('.').pop() ?? ''
  const contentType =
    [...ALLOWED_TYPES.entries()].find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream'

  return { body, contentType }
}

/* ------------------------------------------------------------------ */
/* Local filesystem fallback (dev only)                               */
/* ------------------------------------------------------------------ */

async function localStore(buffer: Buffer, key: string): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const path = await import('node:path')

  const UPLOAD_ROOT = path.join(process.cwd(), '.uploads')
  const destination = path.join(UPLOAD_ROOT, key)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, buffer)
}

async function localRead(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  const { readFile } = await import('node:fs/promises')
  const path = await import('node:path')

  // Reject traversal outright rather than relying on normalisation.
  if (key.includes('..') || path.isAbsolute(key)) return null

  const UPLOAD_ROOT = path.join(process.cwd(), '.uploads')
  const resolved = path.resolve(UPLOAD_ROOT, key)
  if (!resolved.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) return null

  try {
    const body = await readFile(resolved)
    const extension = path.extname(resolved).slice(1)
    const contentType =
      [...ALLOWED_TYPES.entries()].find(([, ext]) => ext === extension)?.[0] ??
      'application/octet-stream'
    return { body, contentType }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Detect driver                                                      */
/* ------------------------------------------------------------------ */

function useSupabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/* ------------------------------------------------------------------ */
/* Public API (unchanged interface)                                   */
/* ------------------------------------------------------------------ */

export async function storeEvidence(file: File): Promise<StoredFile> {
  if (file.size === 0) throw new UploadError('The photo is empty.')
  if (file.size > MAX_BYTES) {
    throw new UploadError(`Photos must be under ${MAX_BYTES / 1024 / 1024} MB.`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const contentType = sniffContentType(buffer)

  if (!contentType || !ALLOWED_TYPES.has(contentType)) {
    throw new UploadError('Upload a JPEG, PNG or WebP photo.')
  }

  const extension = ALLOWED_TYPES.get(contentType)!
  const sha256 = createHash('sha256').update(buffer).digest('hex')

  // Date-sharded so a directory listing never grows unbounded.
  const now = new Date()
  const shard = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const key = `${shard}/${randomUUID()}.${extension}`

  if (useSupabase()) {
    await supabaseStore(buffer, key, contentType)
  } else {
    await localStore(buffer, key)
  }

  return { key, contentType, bytes: buffer.byteLength, sha256 }
}

export async function readEvidence(
  key: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (useSupabase()) {
    return supabaseRead(key)
  }
  return localRead(key)
}

import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Evidence storage.
 *
 * Violation photos show number plates, vehicles and sometimes people. They are
 * evidence in a process that can end in a penalty, so they are **never** served
 * from /public — every read goes through an authorization check tied to the
 * violation the image belongs to (see src/server/violations/access.ts).
 *
 * The local driver writes under .uploads/ (gitignored). The interface is
 * deliberately S3-shaped so swapping in object storage later is a driver
 * change, not a refactor.
 */

const UPLOAD_ROOT = path.join(process.cwd(), '.uploads')

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

  const destination = path.join(UPLOAD_ROOT, key)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, buffer)

  return { key, contentType, bytes: buffer.byteLength, sha256 }
}

export async function readEvidence(
  key: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  // Reject traversal outright rather than relying on normalisation.
  if (key.includes('..') || path.isAbsolute(key)) return null

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

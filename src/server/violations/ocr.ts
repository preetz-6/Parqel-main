import 'server-only'

import { readEvidence } from '../storage'
import { normalisePlate } from './plate-normalise'

/**
 * Automatic plate reading.
 *
 * Three things make this tractable, and all three are deliberate:
 *
 * 1. **We never read arbitrary plates.** The output is matched against the
 *    organisation's own registry of a few hundred vehicles, so a mediocre read
 *    still resolves to a one-tap confirmation. Indian plates are famously
 *    non-standard — stylised fonts, mud, tinted covers, two-line layouts, HSRP
 *    versus old — and raw accuracy from a phone at an angle at night is well
 *    below vendor demos.
 * 2. **OCR never decides anything.** It fills `ocrPlate` and `ocrConfidence`;
 *    `matchedVehicleId` is only ever set by a human at triage.
 * 3. **Failure is not an error.** A report must file whether or not the vendor
 *    is reachable, so callers treat a null result as "no suggestion".
 *
 * The HTTP call below follows Plate Recognizer's documented API but has never
 * run against the real service — there is no token yet. Treat it as unverified
 * until someone points it at a live key.
 */

export type OcrReading = {
  plate: string
  confidence: number
  provider: string
}

export function ocrConfigured(): boolean {
  return (process.env.OCR_PROVIDER ?? 'none') !== 'none'
}

type PlateRecognizerResponse = {
  results?: Array<{ plate?: string; score?: number }>
}

export async function readWithPlateRecognizer(
  body: Buffer,
  contentType: string,
): Promise<OcrReading | null> {
  const token = process.env.PLATE_RECOGNIZER_TOKEN
  if (!token) throw new Error('PLATE_RECOGNIZER_TOKEN is not set')

  const form = new FormData()
  form.set('upload', new Blob([new Uint8Array(body)], { type: contentType }), 'evidence')

  // Biasing to the deployment's region measurably improves reads on Indian
  // plates, which the generic model over-segments.
  const regions = process.env.OCR_REGIONS
  if (regions) {
    for (const region of regions.split(',').map((r) => r.trim()).filter(Boolean)) {
      form.append('regions', region)
    }
  }

  const response = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    body: form,
    // A report is a foreground action; do not let a slow vendor hold it open.
    signal: AbortSignal.timeout(Number(process.env.OCR_TIMEOUT_MS ?? 8000)),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Plate Recognizer returned ${response.status}`)
  }

  const data = (await response.json()) as PlateRecognizerResponse
  const best = data.results?.[0]

  if (!best?.plate) return null

  const plate = normalisePlate(best.plate)
  if (plate.length < 4) return null

  return {
    plate,
    confidence: typeof best.score === 'number' ? Number(best.score.toFixed(2)) : 0,
    provider: 'platerecognizer',
  }
}

/**
 * Reads the plate from stored evidence.
 *
 * Returns null rather than throwing for every failure mode — unconfigured,
 * unreachable, timed out, nothing found. The caller is filing a violation and
 * must not be blocked by any of those.
 */
export async function readPlateFromEvidence(imageKey: string): Promise<OcrReading | null> {
  const provider = process.env.OCR_PROVIDER ?? 'none'
  if (provider === 'none') return null

  try {
    const file = await readEvidence(imageKey)
    if (!file) return null

    if (provider === 'platerecognizer') {
      return await readWithPlateRecognizer(file.body, file.contentType)
    }

    console.warn(`[ocr] unknown OCR_PROVIDER "${provider}" — skipping`)
    return null
  } catch (error) {
    // Logged, never surfaced: the reporter did nothing wrong.
    console.error('[ocr] read failed', error)
    return null
  }
}

/**
 * Reads a plate from a raw image buffer (not yet stored as evidence).
 *
 * Used by the scan endpoint where a user captures a plate photo before filing
 * a report. Same failure semantics as `readPlateFromEvidence` — null on every
 * failure path so a broken vendor can never block the UI.
 */
export async function readPlateFromBuffer(
  body: Buffer,
  contentType: string,
): Promise<OcrReading | null> {
  const provider = process.env.OCR_PROVIDER ?? 'none'
  if (provider === 'none') return null

  try {
    if (provider === 'platerecognizer') {
      return await readWithPlateRecognizer(body, contentType)
    }

    console.warn(`[ocr] unknown OCR_PROVIDER "${provider}" — skipping`)
    return null
  } catch (error) {
    console.error('[ocr] scan failed', error)
    return null
  }
}

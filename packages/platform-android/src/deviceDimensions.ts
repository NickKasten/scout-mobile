import { execFileSync } from 'node:child_process'

export interface DeviceDimensions {
  width: number
  height: number
}

/**
 * Small fallback table of physical-pixel resolutions for common Pixel AVDs.
 * Android has far too many device configurations for a comprehensive static
 * table (unlike iOS), so this is only used when `adb shell wm size` cannot be
 * parsed. Primary resolution is always the dynamic query below.
 */
const FALLBACK_DIMENSIONS: Record<string, DeviceDimensions> = {
  Pixel_7: { width: 1080, height: 2400 },
  Pixel_7_Pro: { width: 1440, height: 3120 },
  Pixel_8: { width: 1080, height: 2400 },
  Pixel_8_Pro: { width: 1344, height: 2992 },
  Pixel_6: { width: 1080, height: 2400 },
  Pixel_Fold: { width: 2208, height: 1840 },
}

/**
 * Parse `adb shell wm size` output into physical-pixel dimensions.
 * Example output: "Physical size: 1080x2400"
 * Returns undefined if the output cannot be parsed.
 */
export function parseWmSize(raw: string): DeviceDimensions | undefined {
  // Prefer "Override size" if present (reflects the active resolution), else
  // "Physical size".
  const override = raw.match(/Override size:\s*(\d+)x(\d+)/)
  const physical = raw.match(/Physical size:\s*(\d+)x(\d+)/)
  const match = override ?? physical
  if (!match) return undefined
  return { width: Number(match[1]), height: Number(match[2]) }
}

/**
 * Look up a fallback resolution for an AVD name (longest-substring match).
 */
export function lookupFallbackDimensions(avdName: string): DeviceDimensions | undefined {
  if (FALLBACK_DIMENSIONS[avdName]) return FALLBACK_DIMENSIONS[avdName]

  let bestMatch: string | undefined
  let bestLength = 0
  for (const key of Object.keys(FALLBACK_DIMENSIONS)) {
    if (avdName.includes(key) && key.length > bestLength) {
      bestMatch = key
      bestLength = key.length
    }
  }
  return bestMatch ? FALLBACK_DIMENSIONS[bestMatch] : undefined
}

/**
 * Query physical-pixel dimensions for a running device via `adb shell wm size`.
 * Returns {0,0} if the query fails or cannot be parsed (mirrors iOS's "unknown
 * dimensions" sentinel so the caller can decide whether to enforce bounds).
 *
 * @param serial      adb device serial (already validated by the caller)
 * @param adbPath     resolved path to the adb binary
 */
export function getDeviceDimensions(serial: string, adbPath: string): DeviceDimensions {
  try {
    const out = execFileSync(adbPath, ['-s', serial, 'shell', 'wm', 'size'], {
      encoding: 'utf-8',
    })
    const dims = parseWmSize(out)
    if (dims) return dims
  } catch {
    // Fall through to {0,0}
  }
  return { width: 0, height: 0 }
}

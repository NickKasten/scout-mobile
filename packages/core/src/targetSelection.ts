/**
 * Scout can drive either an iOS Simulator or an Android Emulator. The bin
 * entrypoint picks exactly one platform package to lazy-load at startup, so the
 * decision must be made before any platform code runs.
 *
 * Selection rules (in order):
 *   1. An explicit `SCOUT_TARGET` env value ('ios' | 'android') always wins.
 *   2. Otherwise default by host OS: macOS → iOS (Xcode lives there), every
 *      other OS → Android (the only adapter that runs off macOS).
 *
 * This is a pure function (env + os passed in) so it can be unit-tested without
 * touching process.env or the real platform.
 */
export type ScoutTarget = 'ios' | 'android'

export function resolveTarget(
  env: Record<string, string | undefined>,
  osPlatform: NodeJS.Platform,
): ScoutTarget {
  const explicit = env.SCOUT_TARGET?.trim().toLowerCase()
  if (explicit === 'ios' || explicit === 'android') {
    return explicit
  }
  return osPlatform === 'darwin' ? 'ios' : 'android'
}

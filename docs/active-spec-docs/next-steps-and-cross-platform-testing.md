# Scout — Next Steps & Cross-Platform Testing Plan

Status snapshot: **Phase 2+ complete, v0.3.0, 336 unit tests, 27 MCP tools
(`device_*` + `simulator_*` alias), iOS + Android + RN.** Android (via the
`@scout-mobile/platform-android` adapter) now runs on macOS, Windows, and Linux;
Windows behavior is proven via unit tests, Windows `pack:check` in CI, and the
manual [`manual-test-windows.md`](manual-test-windows.md) script. The original
goal below has been delivered.

Goal (delivered): move into Phase 2+ so Android (and iOS where possible) is
available to both macOS and Windows/Linux users, and prove it works on Windows
without owning a Windows machine.

---

## Part A — Current state assessment

### What works
- `PlatformAdapter` × `FrameworkAdapter` composition is clean and ready to host a second platform.
- iOS adapter correctly hard-throws on non-macOS (`packages/platform-ios/src/envChecks.ts:52`), so
  Windows users get a clean error today — but no functionality.
- CI already runs unit tests across `ubuntu-latest`, `macos-latest`, `windows-latest`
  (`.github/workflows/ci.yml:13`).

### Blockers that must be fixed before Android can ship
These are concrete, in-code obstacles — not theoretical:

1. **`server.ts` is iOS-hardcoded.** Every tool is named `simulator_*` with iOS-specific
   descriptions ("iOS Simulator", "requires idb"). The interface is adapter-neutral but the
   MCP surface is not. (`packages/core/src/server.ts:24-368`)
2. **`bin/scout.mjs` always instantiates `IOSSimulatorAdapter`** with no target selection.
   (`packages/core/bin/scout.mjs:8`)
3. **No `@scout-mobile/platform-android` package exists** yet, though architecture.md and the
   OS support matrix already reference it.

### Decision needed (flag, do not silently deviate — per CLAUDE.md locked decisions)
Tool naming. Today tools are `simulator_*`. Options:
- **(Recommended) Keep generic names, make descriptions adapter-driven.** Rename internally to
  platform-neutral concepts but keep the `simulator_*` wire names for backward compat, and let
  each adapter supply its own tool descriptions/availability. Lowest churn for existing users.
- Introduce a parallel `device_*` namespace. Cleaner long-term, but a breaking change for the
  documented `.mcp.json` and any early adopters.
This should be confirmed before implementation since it touches the public MCP surface.

---

## Part B — Phase 2+ roadmap (Android on Windows/Linux + Mac)

Sequenced so each step is independently testable and shippable.

### Step 1 — Make the MCP server adapter-neutral (no new functionality)
- Add per-adapter metadata to `PlatformAdapter` (e.g. `displayName`, `requiresElementTooling`,
  tool descriptions) so `server.ts` stops hardcoding "iOS Simulator" / "requires idb".
- Keep existing `simulator_*` tool names (pending the naming decision above) so current users
  are unaffected.
- Pure refactor: existing 202 tests must stay green; add tests asserting descriptions come from
  the adapter, not hardcoded strings.
- **Ship-gate:** no behavior change on iOS; full matrix green.

### Step 2 — Scaffold `@scout-mobile/platform-android`
- New workspace package mirroring `platform-ios` layout (`src/`, `__tests__/`, `__integration__/`).
- `AndroidEmulatorAdapter implements PlatformAdapter`.
- Tooling it shells out to (all cross-platform, all via `execFileSync` with args arrays — never
  string interpolation, per locked decision):
  - `adb` — install (`adb install`), launch (`adb shell am start`), tap/swipe
    (`adb shell input tap|swipe`), text (`adb shell input text`), key events
    (`adb shell input keyevent`), screenshot (`adb exec-out screencap -p`), logcat (log stream).
  - `emulator` / `avdmanager` — boot an AVD by name.
  - `uiautomator dump` — accessibility tree (XML; parse to the existing `AccessibilityTree` shape).
- `envChecks.ts` for Android: detect `ANDROID_HOME`/`ANDROID_SDK_ROOT`, `adb`, `emulator`, a
  configured AVD. These checks pass on Windows/Linux/macOS — no OS gate.
- Reuse `@scout-mobile/core` validation allowlists; add Android-specific ones
  (package name regex, AVD name regex, keyevent allowlist).

### Step 3 — Target selection in `bin/scout.mjs`
- Select adapter via env/config: `SCOUT_TARGET=ios|android` (default by OS:
  android on win/linux, ask/iOS on mac).
- On Windows/Linux, never instantiate the iOS adapter (it would throw); instantiate Android.
- `scout_check_environment` reports the active target's checks.

### Step 4 — Path & shell cross-platform hardening
- Audit every path join for Windows separators; the core `safeResolvePath` already uses
  `path.sep` (`packages/core/src/validation.ts`), but verify adapter-level temp paths
  (screenshots to `tmpdir()`) behave on Windows.
- `adb`/`emulator` resolution on Windows (`.exe` suffix, `ANDROID_HOME\platform-tools`).
- No `.sh`-isms; avoid shell features that differ across cmd/powershell/bash.

### Step 5 — Docs & packaging
- Update `architecture.md` OS matrix (already lists Android as cross-platform), `mcp-tools.md`,
  `phases.md` (mark Phase 2+ Android items), `README.md` requirements/install, and
  `CLAUDE.md` test counts.
- Add an Android section to install docs (SDK, AVD setup).
- `pack:check` must include the new package.

### Step 6 — Optional: Flutter framework adapter (defer)
- `framework-flutter` is the natural pair for Android on Windows but is a separate effort.
  Keep it out of this milestone unless RN-on-Android is proven first.

---

## Part C — Cross-platform testing strategy (the core ask)

The challenge: you only have a Mac, but need confidence Scout behaves correctly on Windows.
Four complementary layers, cheapest/fastest first. All four were approved.

### Layer 1 — Mocked-OS unit tests (run on your Mac, prove Windows code paths)
Goal: exercise Windows/Linux logic deterministically without a Windows machine.
- Mock `node:os` `platform()` (the codebase already does this — see `envChecks.test.ts` and
  `vi.mock('os')` usage) to assert:
  - iOS adapter throws the correct `ScoutEnvironmentError` on `win32` and `linux`.
  - Android adapter's env checks pass (or fail gracefully) on `win32`/`linux`/`darwin`.
  - `bin` target selection picks Android on `win32`/`linux`.
- Mock `execFileSync` to simulate Windows `adb`/`emulator` responses and `.exe` resolution,
  and to assert **arg arrays** are correct (also a security regression guard).
- Add path tests using `path.win32` vs `path.posix` to prove `safeResolvePath` and temp-file
  handling reject traversal and build correct separators on both.
- **Outcome:** the majority of Windows-specific logic is verified in the existing Vitest suite
  on every push, on your Mac.

### Layer 2 — GitHub Actions Windows CI (already half-wired)
- `windows-latest` already runs `npm ci`, build, typecheck, test, audit (`ci.yml:13`).
- Extend it:
  - Run `pack:check` on Windows too (not just ubuntu) to catch path/bin issues in the published
    tarball.
  - Add a **Windows smoke job** that installs the Android SDK command-line tools + a headless
    AVD (`reactivecircus/android-emulator-runner` action supports Windows/macOS/Linux), boots
    an emulator, and runs the Android `__integration__` suite. Start with the cheapest checks:
    `scout_check_environment`, boot, screenshot, logcat — mirroring the iOS integration test.
  - Keep emulator jobs `if:` gated to `main` (they're slow/flaky) like the current iOS job.
- **Outcome:** real Windows execution of install/build/test on every push; real Android emulator
  coverage on merges to main — all without you owning hardware.

### Layer 3 — Cloud Windows VM (manual deep smoke when CI isn't enough)
- For things hard to assert in CI (interactive flows, real device quirks, MCP wiring inside
  Claude Code on Windows), spin up an ephemeral Windows VM:
  - Options: a free-tier cloud Windows instance, or a short-lived VM. (Nested virtualization is
    needed for the Android emulator — confirm the chosen provider/runner supports it; otherwise
    use an ARM/x86 host that exposes KVM/HAXP/WHPX.)
- Use the manual test script (Layer 4) on it.
- **Outcome:** high-fidelity manual verification a few times per milestone, not per commit.

### Layer 4 — Recruit a Windows beta tester + documented manual script
- Write `docs/manual-test-windows.md`: a numbered, copy-pasteable script covering
  install → configure `.mcp.json` → `scout_check_environment` → boot AVD → install/launch a
  sample APK → screenshot → tap/type → logcat → run a flow.
- Include expected output for each step and a "report back" template (OS version, SDK version,
  what failed).
- Hand to a Windows-using friend/beta tester each milestone.
- **Outcome:** catches real-world environment drift (SDK versions, PATH, AV interference) that
  clean CI runners never reproduce.

### Testing matrix summary

| Layer | Where it runs | What it proves | Frequency |
|---|---|---|---|
| 1. Mocked-OS unit | Your Mac + all CI | Windows/Linux code paths, arg arrays, path handling | Every push |
| 2. Windows CI | GitHub `windows-latest` | Real install/build/test; real Android emulator | Push (unit) / main (emulator) |
| 3. Cloud VM | Ephemeral Windows VM | Interactive + MCP-in-Claude-Code fidelity | Per milestone |
| 4. Beta tester | Real user hardware | Environment drift, real-world breakage | Per milestone |

---

## Part D — Also needed for Phase 3 (Publishable 1.0), in parallel

From `phases.md`, independent of platform work:
- `testMode` fully implemented across all three modes.
- `suggestMessage` configurable.
- Report writer complete with auto-`.gitignore` behavior.
- Example project in repo (currently `test-app/` exists but isn't documented as the example).
- CI matrix fully green including new Android/Windows jobs.
- `npm audit` blocking on high/critical (already wired).

---

## Recommended execution order

1. Confirm the tool-naming decision (Part A) — touches public MCP surface.
2. Land Layer 1 mocked-OS tests **first** (cheap safety net before refactor).
3. Step 1: adapter-neutral server refactor (no behavior change, full matrix green).
4. Step 2–4: Android adapter + target selection + path hardening, with Layer 1 tests written
   alongside each piece.
5. Wire Layer 2 Windows emulator CI.
6. Docs (Step 5) + Layer 4 manual script.
7. Layer 3 cloud-VM pass + beta tester round before tagging the release.
8. Fold in Phase 3 (Part D) items, then publish.

Per CLAUDE.md workflow: after each plan completes and tests pass, stage/commit/push, and update
README.md, CLAUDE.md, and auto-memory whenever test counts / tool counts / Node version change.

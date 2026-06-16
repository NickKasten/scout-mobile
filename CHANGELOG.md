# Changelog

All notable changes to Scout Mobile are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [0.3.0] — 2026-06-16

Phase 2+: Android support on every OS, an adapter-neutral MCP server, and
cross-platform testing.

### Added
- **`@scout-mobile/platform-android`** — `AndroidEmulatorAdapter` driving `adb`,
  `emulator`, and `uiautomator`. Runs on macOS, Windows, and Linux (no OS gate).
  Includes SDK/adb/emulator/AVD environment checks, dynamic device dimensions
  (`adb shell wm size`), and a dependency-free uiautomator XML accessibility parser.
- **Adapter-neutral MCP server** — every operation is now registered under a
  canonical `device_*` name plus a `simulator_*` deprecated alias (27 tools total:
  13 + 13 + `scout_check_environment`). Tool descriptions adapt to the active
  platform via an optional `AdapterMeta`.
- **React Native Android build path** — `ReactNativeAdapter.build()` branches to
  `gradlew assembleDebug` (`gradlew.bat` on Windows) when `platform: 'android'`.
- **Target selection** — `resolveTarget(env, osPlatform)` picks one platform package
  in the bin: `SCOUT_TARGET` wins, else macOS → iOS and every other OS → Android.
  Only the selected package is lazy-loaded; a missing package prints a friendly
  `npm install` message instead of a stack trace.
- **Cross-platform + Android CI** — `pack:check` now runs on Windows too; the
  integration job is split into `integration-ios` (macOS) and `integration-android`
  (Ubuntu emulator). New cross-platform unit tests (iOS adapter throws cleanly off
  macOS; path-traversal across separators) and Android adapter/env/parser suites.
- **`docs/manual-test-windows.md`** — copy-paste Windows verification script, since
  hosted Windows runners can't nest-virtualize an emulator.
- `validateAndroidSerial` / `validateAvdName` input validators in `@scout-mobile/core`.

### Changed
- Coordinates are **physical pixels** on Android (vs logical points on iOS).
- Upgraded `vitest` 3 → 4 (dev dependency), which resolves vite 8 / rolldown and
  clears the audit-blocking vite/esbuild advisories.

### Security
- Added a root `overrides` pin for `fast-uri` (`^3.1.2`) to patch a high-severity
  transitive (reached via `@modelcontextprotocol/sdk` → `ajv`) that the SDK had not
  yet picked up. `npm audit --audit-level=high` is clean (0 vulnerabilities).

### Fixed
- Two Android `resolveTool` env-check tests hardcoded posix path separators and
  failed on the Windows CI runner; they now build expectations with `path.join`.

### Stats
- 27 MCP tools (13 `device_*` + 13 `simulator_*` aliases + `scout_check_environment`),
  336 unit tests.

## [0.2.3] — 2026-04-26

### Changed
- Upgrade CI to Node 22 and GitHub Actions v6
- Require Node 22+ (previously Node 20+)

### Stats
- 202 unit tests, 14 MCP tools

## [0.2.0] — 2026-04-21

### Added
- Flow runner system with YAML-based test definitions (`simulator_run_flow` MCP tool)
- YAML parser for `flows.yaml` with flow assertions (supports element names and coordinates)
- Frame-timing jank detection module
- Windows CI — unit tests now run on both Ubuntu and Windows
- Integration test scaffold for `platform-ios`

### Fixed
- `writeReport` path prefix check used `/` instead of `path.sep`, breaking Windows

### Stats
- 14 MCP tools, 201 unit tests

## [0.1.0] — 2026-04-13

### Added
- MCP server with 13 tools: environment check, simulator boot/install/launch, screenshot, tap, swipe, log stream, type text, press key, clear text, tap element, accessibility tree
- `PlatformAdapter` × `FrameworkAdapter` dual-interface architecture
- `IOSSimulatorAdapter` with device awareness, bounds checking, and UDID targeting
- `ReactNativeAdapter` with xcodebuild integration
- Report writer with auto-`.gitignore`
- Input validation with regex allowlists
- CI pipeline (Ubuntu unit tests, macOS integration tests)
- npm publish workflow with provenance

### Stats
- 13 MCP tools, 143 unit tests

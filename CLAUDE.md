# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Scout is a Claude Code MCP plugin that gives Claude Code programmatic control over the iOS Simulator for React Native developers on macOS. It exposes MCP tools for booting simulators, installing/launching apps, taking screenshots, UI interaction, log streaming, and error reporting.

The canonical design document is `SPEC.md` — consult it for detailed decisions, security rationale, and phase milestones.

## Current Status

Phase 0 — the repo is pre-scaffolding. Only `.gitignore`, `LICENSE`, `SPEC.md`, and `SECURITY.md` exist. Source code, `package.json`, and CI workflows have not been created yet.

## Planned Commands

Once scaffolded (npm workspaces monorepo):

- `npm ci` — install (CI) / `npm install` (local)
- `npm run build` — compile TypeScript (per-package)
- `npm run test` — unit tests via Vitest (runs on any platform)
- `npm run test:integration` — integration tests (macOS only, requires Xcode + booted simulator)
- `npm audit --audit-level=high` — security audit (blocks on high/critical in CI)

## Architecture

### Adapter Composition Pattern

The core design separates **platform control** (`PlatformAdapter`) from **app building** (`FrameworkAdapter`). These compose independently:

```
PlatformAdapter  ×  FrameworkAdapter
ios-simulator    ×  react-native     ← v1
android-emulator ×  flutter          ← Phase 2
```

- `PlatformAdapter` — controls the device/sim: `boot()`, `install()`, `launch()`, `screenshot()`, `tap()`, `swipe()`, `logStream()`, `accessibilityTree()`, `teardown()`
- `FrameworkAdapter` — builds the app: `build()` → artifact path, `getBundleId()`, optional `getMetroLogs()`

### Package Structure (npm workspaces)

```
packages/
├── core/           @scout-mobile/core          — interfaces, test loop, flow runner, report writer, MCP server entry
├── platform-ios/   @scout-mobile/platform-ios   — IOSSimulatorAdapter (xcrun simctl + idb)
└── framework-rn/   @scout-mobile/framework-rn   — ReactNativeAdapter (npx react-native run-ios)
```

### MCP Tools (10 total)

`scout_check_environment`, `simulator_boot`, `simulator_install`, `simulator_launch`, `simulator_screenshot`, `simulator_tap`, `simulator_swipe`, `simulator_log_stream`, `simulator_accessibility_tree`, `simulator_run_flow`

## Security Rules — Must Follow

1. **Never use string interpolation for shell commands.** Always use `execFileSync`/`spawnSync` with an args array — never `exec` or template literals.
   ```typescript
   // ✅ execFileSync('xcrun', ['simctl', 'boot', deviceId])
   // ❌ execSync(`xcrun simctl boot ${deviceId}`)
   ```
2. **Validate all user-supplied values** (bundle IDs, device names, file paths, flow names) with regex allowlists before use.
3. **Prevent path traversal** — `resolve()` + prefix-check for any file path operations.
4. **Zero runtime dependencies target** for `@scout-mobile/core`. The only justified runtime dep is `@modelcontextprotocol/sdk`.
5. **Only publish `dist/`, `README.md`, `LICENSE`** — strict `files` field in each package.json.

## Testing Conventions

- **Unit tests**: pure functions, mock adapters, run anywhere. Located alongside source or in `__tests__/` dirs.
- **Integration tests**: require macOS + Xcode + booted simulator. Located in `packages/platform-ios/src/__integration__/`. Auto-skip when `process.platform !== 'darwin'`.
- **Test runner**: Vitest.
- **CI**: unit tests on `ubuntu-latest` (every PR), integration tests on `macos-latest` (merge to main only).

## Key Design Decisions

- **Flow targeting**: supports both element names (preferred, via idb accessibility tree) and coordinates (fallback). Both syntaxes in `flows.yaml` from day one.
- **Layout detection**: heuristics only in v1 — Claude flags unambiguous visual failures from screenshots. No baseline diffing.
- **testMode**: `"suggest"` (default, user confirms), `"auto"` (silent, surfaces on issues), `"manual"` (user triggers with `/scout test`).
- **OS checks are per-adapter**, not global — future Android/web adapters won't be blocked on non-macOS.
- **`reportDir` auto-added to `.gitignore`** on first run (reports contain base64 screenshots).

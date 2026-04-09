# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Scout is a Claude Code MCP plugin that gives Claude Code programmatic control over the iOS Simulator for React Native developers on macOS. It exposes MCP tools for booting simulators, installing/launching apps, taking screenshots, UI interaction, log streaming, and error reporting.

The canonical design document is `SPEC.md` — consult it for detailed decisions, security rationale, and phase milestones.

## Current Status

Phase 2 in progress — device awareness, text input, and accessibility tree are implemented. 13 MCP tools, unit tests passing. Flow runner and flow assertions are next.

## Commands

- `npm ci` — install (CI) / `npm install` (local)
- `npm run build` — compile TypeScript (per-package via `tsc --build`)
- `npm run test` — unit tests via Vitest (runs on any platform, 107 tests)
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

- `PlatformAdapter` — controls the device/sim: `boot()` → `BootResult`, `install()`, `launch()`, `screenshot()`, `tap()`, `swipe()`, `logStream()`, `typeText()`, `pressKey()`, `clearText()`, `tapElement()`, `accessibilityTree()` → `AccessibilityTree`, `teardown()`
- `FrameworkAdapter` — builds the app: `build()` → artifact path, `getBundleId()`, optional `getMetroLogs()`

### Package Structure (npm workspaces)

```
packages/
├── core/           @scout-mobile/core          — interfaces, test loop, flow runner, report writer, MCP server entry
├── platform-ios/   @scout-mobile/platform-ios   — IOSSimulatorAdapter (xcrun simctl + idb)
└── framework-rn/   @scout-mobile/framework-rn   — ReactNativeAdapter (npx react-native run-ios)
```

### MCP Tools (13 implemented)

`scout_check_environment`, `simulator_boot`, `simulator_screenshot`, `simulator_install`, `simulator_launch`, `simulator_tap`, `simulator_swipe`, `simulator_log_stream`, `simulator_type_text`, `simulator_press_key`, `simulator_clear_text`, `simulator_tap_element`, `simulator_accessibility_tree`

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
6. **Validate text input** with printable-ASCII allowlist. Key events use a strict name allowlist. No raw keycodes.

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

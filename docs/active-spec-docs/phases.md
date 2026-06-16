# Scout — Build Phases & Distribution

## Current Status: Phase 2+ — Cross-Platform (Android + adapter-neutral server)

---

## Phase 0 — Proof of Concept ✅
- Scaffold MCP server (`@modelcontextprotocol/sdk` + TypeScript, monorepo-ready)
- Implement `PlatformAdapter` and `FrameworkAdapter` interfaces
- Implement `IOSSimulatorAdapter` with OS and environment checks
- Expose `scout_check_environment` and `simulator_screenshot` tools
- Set up Vitest with unit tests for validation and OS detection

**Done when:** Claude Code boots a sim, takes a screenshot, and describes the UI. ✅

---

## Phase 1 — MVP Loop ✅
- Implement `ReactNativeAdapter`
- Metro log streaming and crash / red screen detection
- Full build → install → launch → screenshot → log → report loop (8 MCP tools)
- Coordinate-based tap for early flow support
- Unit tests for report writer and test loop (64 tests)

**Done when:** Claude catches a red screen and surfaces a suggested fix. ✅

---

## Phase 2 — Full Interaction Loop ✅
- ✅ Device dimension awareness at boot (static lookup table, `DeviceInfo` return type)
- ✅ Bounds checking on `tap()` and `swipe()` coordinates
- ✅ `type_text` and `press_key` tools (idb-based, validated input)
- ✅ `accessibility_tree` implementation (idb `describe-all`, structured `AccessibilityTree`)
- ✅ Flow runner (`run_flow`, reads `flows.yaml`)
- ✅ Flow assertions (`assert: { visible: "..." }`)
- ✅ Performance / jank detection
- ✅ Integration test suite for `IOSSimulatorAdapter` (scaffold)

**Done when:** Claude executes a named flow end-to-end and reports across all issue categories. ✅

---

## Phase 2+ — Cross-Platform (Android + adapter-neutral server) ← *current*
- ✅ Adapter-neutral MCP server: canonical `device_*` tool names with `simulator_*` deprecated aliases (27 tools total), descriptions driven by an optional `AdapterMeta`
- ✅ `@scout-mobile/platform-android` — `AndroidEmulatorAdapter` (`adb` + `emulator` + `uiautomator`), runs on macOS/Windows/Linux with no OS gate
- ✅ Android env checks, dynamic device dimensions (`adb shell wm size`), dependency-free uiautomator XML parser, physical-pixel coordinates
- ✅ React Native Android build path (`gradlew assembleDebug` / `gradlew.bat`)
- ✅ Target selection in the bin via `resolveTarget(env, osPlatform)` + friendly missing-package install message
- ✅ Cross-platform tests (iOS throws off macOS; Android env across OSes; path traversal), Windows `pack:check` + Ubuntu Android emulator CI, manual Windows test guide

**Done when:** Claude drives an Android emulator end-to-end on a non-macOS host. ✅

---

## Phase 3 — Publishable 1.0
- `testMode` fully implemented across all three modes
- `suggestMessage` configurable
- Report writer complete with auto-`.gitignore` behavior
- README and install docs complete
- CI matrix fully green (unit on ubuntu-latest, integration on macos-latest)
- `npm audit` blocking on high/critical in CI
- Example project in repo

**Done when:** A developer can install and be running in under 5 minutes.

---

## Phase 4 — Public Launch
- Publish `@scout-mobile/*` to npm with provenance
- MCP marketplace listing
- Product Hunt + Hacker News Show HN
- Personal website project page with demo video

---

## Distribution Channels

| Channel | Purpose |
|---|---|
| npm (`@scout-mobile`) | Primary install |
| GitHub (`scout-mobile`) | Source, issues, changelog |
| MCP Marketplace | Claude Code ecosystem discovery |
| Product Hunt | Broader dev audience |
| Hacker News (Show HN) | Technical credibility |
| Personal website | Portfolio + demo video |

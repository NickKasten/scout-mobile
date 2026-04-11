# Scout — Build Phases & Distribution

## Current Status: Phase 2 — Full Interaction Loop

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

## Phase 2 — Full Interaction Loop ← *current*
- ✅ Device dimension awareness at boot (static lookup table, `DeviceInfo` return type)
- ✅ Bounds checking on `tap()` and `swipe()` coordinates
- ✅ `simulator_type_text` and `simulator_press_key` tools (idb-based, validated input)
- ✅ `simulator_accessibility_tree` implementation (idb `describe-all`, structured `AccessibilityTree`)
- ☐ Flow runner (`simulator_run_flow`, reads `flows.yaml`)
- ☐ Flow assertions (`assert: { visible: "..." }`)
- ☐ Performance / jank detection
- ☐ Integration test suite for `IOSSimulatorAdapter`

**Done when:** Claude executes a named flow end-to-end and reports across all issue categories.

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

# Scout

> iOS Simulator iteration loop for Claude Code — for React Native and beyond.

Scout gives Claude Code eyes and hands inside the iOS Simulator, closing the mobile iteration loop the same way Claude Code already closes the web loop (computer use → DOM → console → fix). It's a Model Context Protocol (MCP) server that exposes a focused set of tools for booting simulators, installing and launching apps, capturing screenshots, driving the UI, streaming logs, and inspecting the accessibility tree — so Claude can build, run, observe, and debug a React Native app end-to-end without a human in the middle.

## Status

Phase 2 complete. 14 MCP tools, iOS Simulator + React Native first-class. 202 unit tests passing.

Phase 0 (PoC) and Phase 1 (MVP loop) are complete. Phase 2 added device awareness, text input, accessibility tree, UDID targeting, clear text, tap-by-element, the flow runner with YAML-based assertions, jank detection, and an integration test scaffold. See [`docs/SPEC.md`](docs/SPEC.md) for the full milestone list and design rationale.

## Requirements

- macOS (the iOS adapter shells out to `xcrun simctl`)
- Xcode + Xcode Command Line Tools (`xcode-select --install`)
- Node 22+
- [`idb`](https://fbidb.io) — required for tap, swipe, type, key, clear text, tap-by-element, and accessibility tree:
  ```sh
  brew tap facebook/fb && brew install idb-companion
  pip3 install fb-idb
  ```
- Claude Code (for the MCP client)

## Install

```sh
npm install @scout-mobile/core @scout-mobile/platform-ios
```

Or install from source:

```sh
git clone https://github.com/<owner>/scout-mobile.git
cd scout-mobile
npm install
npm run build
```

## Configure with Claude Code

Add Scout to your `.mcp.json` (either at the repo root of the project you're working on or in your Claude Code config), pointing at the built `scout` binary. A `.mcp.json.example` is provided as a starting point:

```json
{
  "mcpServers": {
    "scout": {
      "command": "node",
      "args": ["/absolute/path/to/scout-mobile/packages/core/bin/scout.mjs"],
      "env": { "SCOUT_BUNDLE_ID": "com.yourapp.bundle" }
    }
  }
}
```

`SCOUT_BUNDLE_ID` is optional. If set, Scout wires up `ReactNativeAdapter` alongside `IOSSimulatorAdapter` so Claude can build and install your RN app automatically. If unset, Scout runs with just the iOS platform adapter (useful for driving an app you've already installed).

Restart Claude Code after editing `.mcp.json` so the new MCP server is picked up.

## MCP tools

| Tool | Purpose |
|---|---|
| `scout_check_environment` | Verify Xcode, `simctl`, and `idb` are installed and reachable |
| `simulator_boot` | Boot a simulator by name or UDID; returns `DeviceInfo` with dimensions |
| `simulator_screenshot` | Capture a PNG screenshot; optional `delayMs` (0–5000) |
| `simulator_install` | Install a `.app` bundle |
| `simulator_launch` | Launch an app by bundle ID |
| `simulator_tap` | Tap at `(x, y)` coordinates (bounds-checked against device size) |
| `simulator_swipe` | Swipe from point A to point B (bounds-checked) |
| `simulator_log_stream` | Stream system logs for N seconds; optional `bundleId` / `processName` filter |
| `simulator_type_text` | Type into the focused field (printable ASCII + tab/newline, max 1000 chars) |
| `simulator_press_key` | Press a named key from an allowlist of 14 |
| `simulator_clear_text` | Clear the focused field (triple-tap select-all + delete, backspace fallback) |
| `simulator_tap_element` | Tap an element by accessibility label via DFS tree search |
| `simulator_accessibility_tree` | Fetch the accessibility tree as structured text |
| `simulator_run_flow` | Run a named UI flow from `flows.yaml` with step-by-step results |

## Architecture

Scout separates **platform control** from **app building** so each axis can evolve independently:

```
PlatformAdapter  ×  FrameworkAdapter
ios-simulator    ×  react-native     ← v1
android-emulator ×  flutter          ← Phase 2+
```

The monorepo is organized as three npm workspaces under `packages/`:

- **`@scout-mobile/core`** — interfaces, input validation, MCP server factory, test loop, report writer, and the `scout` CLI binary. Zero runtime dependencies beyond `@modelcontextprotocol/sdk` and `zod`.
- **`@scout-mobile/platform-ios`** — `IOSSimulatorAdapter` driving `xcrun simctl` and `idb`.
- **`@scout-mobile/framework-rn`** — `ReactNativeAdapter` driving `npx react-native run-ios` (via `xcodebuild`).

## Development

```sh
npm install       # install workspace deps
npm run build     # tsc --build across all packages
npm run test      # vitest run (202 unit tests)
npm run typecheck # tsc --build --noEmit
```

Unit tests run on any platform. Integration tests live under `packages/platform-ios/src/__integration__/` and require macOS + Xcode + a booted simulator; they auto-skip on non-darwin.

## Security

Scout treats every user input as untrusted and shells out only through `execFileSync` / `spawn` with argument arrays — never string interpolation. All inputs (bundle IDs, device names, file paths, text, key names, accessibility labels) are validated against regex allowlists, file paths are normalized with `resolve()` + prefix check to prevent traversal, and `@scout-mobile/core` holds a strict zero-runtime-dependency policy beyond the MCP SDK and `zod`. Full rules: [`docs/SECURITY.md`](docs/SECURITY.md).

## Docs

- [Design document](docs/SPEC.md)
- [Security notes](docs/SECURITY.md)
- [Claude Code guidance](CLAUDE.md)
- [Test app](test-app/) — React Native app used to exercise Scout's tools manually

## License

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0).

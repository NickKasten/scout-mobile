# Scout

> Mobile simulator/emulator iteration loop for Claude Code — iOS and Android, for React Native and beyond.

Scout gives Claude Code eyes and hands inside the iOS Simulator **and the Android Emulator**, closing the mobile iteration loop the same way Claude Code already closes the web loop (computer use → DOM → console → fix). It's a Model Context Protocol (MCP) server that exposes a focused set of tools for booting devices, installing and launching apps, capturing screenshots, driving the UI, streaming logs, and inspecting the accessibility tree — so Claude can build, run, observe, and debug a React Native app end-to-end without a human in the middle.

## Status

Phase 2+ complete. 27 MCP tools (13 `device_*` canonical + 13 `simulator_*` deprecated aliases + `scout_check_environment`). iOS Simulator (macOS) **and Android Emulator (macOS, Windows, Linux)** + React Native first-class. 336 unit tests passing.

Phase 0 (PoC) and Phase 1 (MVP loop) are complete. Phase 2 added device awareness, text input, accessibility tree, UDID targeting, clear text, tap-by-element, the flow runner with YAML-based assertions, jank detection, and an integration test scaffold. Phase 2+ made the MCP server platform-neutral (`device_*`/`simulator_*` dual tool names), added the Android Emulator adapter (`adb` + `emulator` + `uiautomator`) that runs on every OS, and added a React Native Android (`gradlew assembleDebug`) build path. See [`docs/SPEC.md`](docs/SPEC.md) for the full milestone list and design rationale.

## Requirements

Common:

- Node 22+
- Claude Code (for the MCP client)

**iOS** (macOS only):

- Xcode + Xcode Command Line Tools (`xcode-select --install`)
- [`idb`](https://fbidb.io) — required for tap, swipe, type, key, clear text, tap-by-element, and accessibility tree:
  ```sh
  brew tap facebook/fb && brew install idb-companion
  pip3 install fb-idb
  ```

**Android** (macOS, Windows, Linux):

- Android SDK with `platform-tools` (adb) and `emulator` packages
- `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) set to the SDK root
- At least one AVD created (Android Studio → Device Manager, or `avdmanager`)

## Install

Install `@scout-mobile/core` plus the platform package(s) you need:

```sh
# iOS
npm install @scout-mobile/core @scout-mobile/platform-ios

# Android
npm install @scout-mobile/core @scout-mobile/platform-android
```

If you run Scout for a target whose platform package isn't installed, it prints a friendly copy-pasteable `npm install` message and exits cleanly (no stack trace).

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
      "env": {
        "SCOUT_TARGET": "ios",
        "SCOUT_BUNDLE_ID": "com.yourapp.bundle"
      }
    }
  }
}
```

`SCOUT_TARGET` selects the platform (`ios` or `android`). If unset, Scout defaults to `ios` on macOS and `android` on every other OS — so existing Mac setups need no change. Only the selected platform package is loaded.

`SCOUT_BUNDLE_ID` is optional. If set, Scout wires up `ReactNativeAdapter` alongside the platform adapter so Claude can build and install your RN app automatically (iOS via `xcodebuild`, Android via `gradlew assembleDebug`). If unset, Scout runs with just the platform adapter (useful for driving an app you've already installed).

Restart Claude Code after editing `.mcp.json` so the new MCP server is picked up.

## MCP tools

Scout registers **27 tools**: a canonical `device_*` name for each of the 13 operations, a matching `simulator_*` **deprecated alias** (same handler, kept for backward compatibility), plus `scout_check_environment`. The table lists the canonical names; the `simulator_*` alias is the same name with `device_` swapped for `simulator_`.

Tool descriptions adapt to the active platform (e.g. install accepts a `.app bundle` on iOS, an `.apk` on Android). Coordinates are **logical points** on iOS and **physical pixels** on Android.

| Tool (canonical) | Deprecated alias | Purpose |
|---|---|---|
| `scout_check_environment` | — | Verify the active platform's tooling is installed and reachable |
| `device_boot` | `simulator_boot` | Boot a device by name/AVD/UDID/serial; returns `DeviceInfo` with dimensions |
| `device_screenshot` | `simulator_screenshot` | Capture a PNG screenshot; optional `delayMs` (0–5000) |
| `device_install` | `simulator_install` | Install an app artifact (`.app` on iOS, `.apk` on Android) |
| `device_launch` | `simulator_launch` | Launch an app by bundle ID |
| `device_tap` | `simulator_tap` | Tap at `(x, y)` (bounds-checked against device size) |
| `device_swipe` | `simulator_swipe` | Swipe from point A to point B (bounds-checked) |
| `device_log_stream` | `simulator_log_stream` | Stream logs for N seconds; optional `bundleId` / `processName` filter |
| `device_type_text` | `simulator_type_text` | Type into the focused field (printable ASCII + tab/newline, max 1000 chars) |
| `device_press_key` | `simulator_press_key` | Press a named key from an allowlist of 14 |
| `device_clear_text` | `simulator_clear_text` | Clear the focused field |
| `device_tap_element` | `simulator_tap_element` | Tap an element by accessibility label via DFS tree search |
| `device_accessibility_tree` | `simulator_accessibility_tree` | Fetch the accessibility tree as structured text |
| `device_run_flow` | `simulator_run_flow` | Run a named UI flow from `flows.yaml` with step-by-step results |

## Architecture

Scout separates **platform control** from **app building** so each axis can evolve independently:

```
PlatformAdapter  ×  FrameworkAdapter
ios-simulator    ×  react-native     ← v1
android-emulator ×  react-native     ← Phase 2+
                 ×  flutter          ← future
```

The monorepo is organized as four npm workspaces under `packages/`:

- **`@scout-mobile/core`** — interfaces, input validation, the platform-neutral MCP server factory, target selection, test loop, report writer, and the `scout` CLI binary. Zero runtime dependencies beyond `@modelcontextprotocol/sdk` and `zod`.
- **`@scout-mobile/platform-ios`** — `IOSSimulatorAdapter` driving `xcrun simctl` and `idb` (macOS only; throws a clean error off macOS).
- **`@scout-mobile/platform-android`** — `AndroidEmulatorAdapter` driving `adb`, `emulator`, and `uiautomator` (runs on macOS, Windows, and Linux).
- **`@scout-mobile/framework-rn`** — `ReactNativeAdapter` building iOS via `xcodebuild` and Android via `gradlew assembleDebug`.

## Development

```sh
npm install       # install workspace deps
npm run build     # tsc --build across all packages
npm run test      # vitest run (336 unit tests)
npm run typecheck # tsc --build --noEmit
```

Unit tests run on any platform (cross-platform paths are covered via mocked `node:os`). Integration tests require a real device and auto-skip otherwise:

- `npm run test:integration:ios` — macOS + Xcode + a booted simulator
- `npm run test:integration:android` — `adb` + a booted emulator
- `npm run test:integration` — runs both

CI runs the unit matrix on Ubuntu, macOS, and Windows; `pack:check` on Ubuntu and Windows; iOS integration on macOS and Android integration on Ubuntu (gated to `main`). Real Windows emulator behavior is verified by hand via [`docs/manual-test-windows.md`](docs/manual-test-windows.md).

## Security

Scout treats every user input as untrusted and shells out only through `execFileSync` / `spawn` with argument arrays — never string interpolation. All inputs (bundle IDs, device names, file paths, text, key names, accessibility labels) are validated against regex allowlists, file paths are normalized with `resolve()` + prefix check to prevent traversal, and `@scout-mobile/core` holds a strict zero-runtime-dependency policy beyond the MCP SDK and `zod`. Full rules: [`docs/SECURITY.md`](docs/SECURITY.md).

## Docs

- [Design document](docs/SPEC.md)
- [Security notes](docs/SECURITY.md)
- [Claude Code guidance](CLAUDE.md)
- [Test app](test-app/) — React Native app used to exercise Scout's tools manually

## License

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0).

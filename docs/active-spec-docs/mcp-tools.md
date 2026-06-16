# Scout — MCP Tools, Configuration & Flows

## MCP Tool Surface

Scout registers **27 tools**: `scout_check_environment` plus 13 operations, each
registered twice — a canonical `device_*` name and a `simulator_*` **deprecated
alias** (same handler, kept for backward compatibility). The table lists the
canonical names; the alias is the same name with `device_` → `simulator_`.

Tool **descriptions** adapt to the active platform via the adapter's optional
`AdapterMeta` (`displayName`, `installArtifact`, `gestureToolingNote`) — e.g.
install accepts a `.app bundle` on iOS and an `.apk` on Android. The server
falls back to neutral defaults when `meta` is absent.

Coordinates are **logical points** on iOS and **physical pixels** on Android.

| Tool (canonical) | Parameters | Returns | Notes |
|---|---|---|---|
| `scout_check_environment` | — | `EnvironmentReport` | Single-registered (no alias). Run before any device interaction |
| `device_boot` | `device?: string` | `DeviceInfo` | iOS: name/UDID; Android: AVD name/serial. Returns dimensions |
| `device_install` | `bundlePath: string` | `void` | `.app` (iOS) / `.apk` (Android) |
| `device_launch` | `bundleId: string` | `void` | |
| `device_screenshot` | `delayMs?: number` | `string` (base64) + dimensions | PNG + device coordinate space |
| `device_tap` | `x: number, y: number` | `void` | Bounds-checked against device dimensions |
| `device_swipe` | `startX, startY, endX, endY` | `void` | Bounds-checked |
| `device_log_stream` | `seconds: number` | `string[]` | iOS system logs / Android logcat |
| `device_type_text` | `text: string` | `void` | iOS needs idb; Android via `adb shell input` |
| `device_press_key` | `key: string` | `void` | Allowlisted key names (mapped per platform) |
| `device_clear_text` | — | `void` | Tree-driven delete with fallback |
| `device_tap_element` | `label: string` | `void` | DFS accessibility-tree search → center tap |
| `device_accessibility_tree` | — | `AccessibilityTree` | iOS: idb; Android: `uiautomator dump` |
| `device_run_flow` | `flowName: string` | `FlowResult` | Reads `flows.yaml` |

`scout_check_environment` example output (iOS):
```
Scout Environment Check
  ✅ macOS 15.2 (Sequoia)
  ✅ Xcode 16.2 (xcrun simctl available)
  ✅ idb 1.1.7
  ❌ React Native project not detected in working directory
     → Expected: package.json with react-native dependency
```

Example output (Android, any OS):
```
Scout Environment Check
  ✅ Android SDK found at /Users/me/Library/Android/sdk
  ✅ adb available
  ✅ emulator available
  ✅ 1 AVD(s) available: Pixel_Fold_API_35
```

---

## Project Configuration (`claude-mobile.config.json`)

```json
{
  "platform": "ios-simulator",
  "framework": "react-native",
  "testMode": "suggest",
  "suggestMessage": "Done. This looks like a good checkpoint — run a simulator check? `/scout test`",
  "device": "iPhone 17 Pro",
  "bundleId": "com.yourapp",
  "metroPort": 8081,
  "flows": "./claude-mobile-flows.yaml",
  "reportDir": "./.claude/mobile-reports"
}
```

### `testMode` Options

| Value | Behavior |
|---|---|
| `"suggest"` | Claude finishes a task → suggests a check. User must confirm. **Default.** |
| `"auto"` | Runs silently post-task. Surfaces output only when issues are found. |
| `"manual"` | Never suggests. User invokes `/scout test` explicitly. |

Per-project `claude-mobile.config.json` overrides global Claude Code settings.

---

## User-Defined Flows (`flows.yaml`)

Flows define named test sequences Claude executes step-by-step. Element names are preferred; coordinates are the fallback.

```yaml
flows:
  - name: login
    steps:
      - tap: { element: "Email input" }        # preferred: element name (Phase 2+)
      - type: { text: "test@example.com" }
      - tap: { element: "Password input" }
      - type: { text: "password123" }
      - tap: { element: "Sign in button" }
      - assert: { visible: "Home screen" }

  - name: onboarding
    steps:
      - swipe: { direction: left }
      - swipe: { direction: left }
      - tap: { x: 195, y: 430 }               # fallback: coordinates (Phase 1+)
      - assert: { visible: "Dashboard" }
```

**Available step types:** `tap` (element or coordinates), `type` (text input), `press` (key event), `swipe`, `assert`.

Element name resolution uses the accessibility tree via `idb` (Phase 2+). Coordinate tapping is available from Phase 1.

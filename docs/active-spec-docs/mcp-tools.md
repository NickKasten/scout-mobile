# Scout — MCP Tools, Configuration & Flows

## MCP Tool Surface

| Tool | Parameters | Returns | Notes |
|---|---|---|---|
| `scout_check_environment` | — | `EnvironmentReport` | Run before any simulator interaction |
| `simulator_boot` | `device?: string` | `DeviceInfo` | Returns UDID, name, logical dimensions |
| `simulator_install` | `bundlePath: string` | `void` | |
| `simulator_launch` | `bundleId: string` | `void` | |
| `simulator_screenshot` | — | `string` (base64) + dimensions | PNG + device coordinate space |
| `simulator_tap` | `x: number, y: number` | `void` | Bounds-checked against device dimensions |
| `simulator_swipe` | `startX, startY, endX, endY` | `void` | Bounds-checked |
| `simulator_log_stream` | `seconds: number` | `string[]` | Metro + system logs |
| `simulator_type_text` | `text: string` | `void` | idb required |
| `simulator_press_key` | `key: string` | `void` | idb required, allowlisted key names |
| `simulator_accessibility_tree` | — | `AccessibilityTree` | idb required, element names + frames |
| `simulator_run_flow` | `flowName: string` | `FlowResult` | Reads `flows.yaml` (Phase 3) |

`scout_check_environment` example output:
```
Scout Environment Check
  ✅ macOS 15.2 (Sequoia)
  ✅ Xcode 16.2 (xcrun simctl available)
  ✅ idb 1.1.7
  ❌ React Native project not detected in working directory
     → Expected: package.json with react-native dependency
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

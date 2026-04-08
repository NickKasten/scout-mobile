# Scout — Software Design Document

> **Package:** `@scout-mobile/core`
> **License:** MIT
> **Author:** Nicholas Kasten
> **Status:** Phase 0 — Active Development

---

## 1. Overview

Scout is a Claude Code MCP plugin that closes the iOS Simulator iteration loop for React Native developers on macOS. It gives Claude Code the ability to boot a simulator, install and launch an app, interact with the UI, observe runtime state, and surface errors — all without the developer leaving their editor.

The mental model mirrors what Claude Code already does for web apps (computer use → DOM interaction → console observation → fix), but for native mobile. Scout is the mobile equivalent of that loop.

### Tagline
> *iOS Simulator iteration loop for Claude Code — for React Native and beyond.*

---

## 2. Goals

- Give Claude Code eyes and hands inside the iOS Simulator
- Surface crashes, layout issues, console errors, and flow failures — with suggested fixes
- Stay out of the developer's way: never run without intent (manual trigger or user-confirmed suggestion)
- Be extensible from day one: iOS + React Native are the first implementation, not the architecture
- Ship as a proper open source npm package usable by the wider React Native / Claude Code community

### Non-goals (v1)
- Android Emulator support (planned Phase 2)
- Flutter / Expo / SwiftUI support (planned Phase 2–3)
- CI/CD integration
- Remote device testing

---

## 3. OS & Environment Detection

### iOS Simulator is macOS-only

`xcrun simctl` is an Apple-exclusive tool — it does not exist on Windows or Linux. This is a hard platform constraint, not a Scout limitation. Attempting to run the iOS platform adapter on a non-macOS machine will fail deep in the tool chain with a confusing error. Scout fails fast and clearly instead.

### Detection Strategy

OS checks are **per-adapter**, not a global gate. This allows future platform adapters (Android, Web) to run on Windows and Linux without being blocked.

```typescript
// packages/platform-ios/src/IOSSimulatorAdapter.ts

import { platform } from 'os'
import { execFileSync } from 'child_process'

function assertMacOS(): void {
  if (platform() !== 'darwin') {
    throw new ScoutEnvironmentError(
      'iOS Simulator requires macOS. ' +
      'Scout\'s iOS platform adapter uses xcrun simctl, which is only available on macOS. ' +
      'If you\'re on Windows or Linux, Android Emulator support is planned for Phase 2.'
    )
  }
}

function assertXcodeInstalled(): void {
  try {
    execFileSync('xcrun', ['simctl', 'help'], { stdio: 'ignore' })
  } catch {
    throw new ScoutEnvironmentError(
      'Xcode Command Line Tools not found. ' +
      'Run: xcode-select --install'
    )
  }
}

function assertIdbInstalled(): void {
  try {
    execFileSync('idb', ['--version'], { stdio: 'ignore' })
  } catch {
    throw new ScoutEnvironmentError(
      'idb (iOS Device Bridge) not found. ' +
      'Run: brew install facebook/fb/idb-companion'
    )
  }
}
```

These checks run once at adapter initialization, before any simulator interaction.

### Environment Check Tool

Scout exposes a dedicated MCP tool for pre-flight validation:

```
scout_check_environment()
```

Returns a structured report of what is installed, what is missing, and how to fix it. Claude Code calls this automatically before the first `simulator_boot` in a session.

Example output:
```
Scout Environment Check
  ✅ macOS 15.2 (Sequoia)
  ✅ Xcode 16.2 (xcrun simctl available)
  ✅ idb 1.1.7
  ❌ React Native project not detected in working directory
     → Expected: package.json with react-native dependency
```

### Per-Adapter OS Support Matrix

| Adapter | macOS | Windows | Linux |
|---|---|---|---|
| `platform-ios` | ✅ | ❌ hard fail with clear message | ❌ hard fail with clear message |
| `platform-android` *(Phase 2)* | ✅ | ✅ | ✅ |
| `framework-rn` | ✅ | ✅ | ✅ |
| `framework-flutter` *(Phase 2)* | ✅ | ✅ | ✅ |

---

## 4. Security Architecture

The npm ecosystem has a well-documented vulnerability problem rooted in transitive dependency bloat, poor publish hygiene, and unsafe shell execution. Scout is designed to not contribute to this.

### 4.1 Dependency Minimalism

Every dependency is a potential attack surface. Scout's policy:

- **No dependency is added without explicit justification.** Each dep in `package.json` must be documentable: what it does, why a native alternative does not work, and what the security posture of the package is.
- **Prefer Node built-ins over third-party packages.** `child_process`, `fs`, `os`, and `path` cover most of what Scout needs for shelling out and file operations.
- **Zero runtime dependencies is the target for `@scout-mobile/core`.** The interfaces, loop logic, and report writer should require no external packages.
- **`@modelcontextprotocol/sdk`** is the one justified exception — it is the MCP protocol implementation maintained by Anthropic.
- **Dev dependencies are not runtime dependencies.** TypeScript, tsx, and test tooling live in `devDependencies` only and are never shipped in the published package.

### 4.2 Command Injection Prevention

Scout shells out to `simctl` and `idb` constantly. Every shell invocation is a potential command injection vector if user-supplied values are interpolated into strings.

**Rule: never use string interpolation for shell commands.**

```typescript
// ❌ NEVER — injectable
execSync(`xcrun simctl boot ${deviceId}`)

// ✅ ALWAYS — array form, no shell interpolation
import { execFileSync } from 'child_process'
execFileSync('xcrun', ['simctl', 'boot', deviceId])
```

`execFileSync` with an args array bypasses the shell entirely — the OS receives arguments directly. No special characters in `deviceId` can escape the argument boundary.

**All user-supplied values must be validated before use:**

```typescript
const BUNDLE_ID_PATTERN = /^[a-zA-Z0-9\-\.]+$/

function validateBundleId(id: string): string {
  if (!BUNDLE_ID_PATTERN.test(id)) {
    throw new ScoutValidationError(`Invalid bundle ID: ${id}`)
  }
  return id
}
```

Values that must be validated: device names, bundle IDs, flow names, file paths, Metro port.

### 4.3 Path Traversal Prevention

Scout writes reports to `reportDir` and reads flows from a user-specified path. Both must be validated to prevent path traversal attacks.

```typescript
import { resolve } from 'path'

function safeReportPath(reportDir: string, filename: string): string {
  const base = resolve(reportDir)
  const target = resolve(reportDir, filename)
  if (!target.startsWith(base + '/')) {
    throw new ScoutValidationError('Path traversal detected in report filename')
  }
  return target
}
```

### 4.4 Lockfile Discipline

- **`package-lock.json` is committed and never gitignored.** It pins the exact resolved dependency tree so installs are reproducible and diffs are auditable.
- **`npm ci` is used in CI**, not `npm install`. It enforces the lockfile exactly and fails rather than silently updating.
- **Dependabot is enabled** on the GitHub repo with weekly checks. Dependency update PRs are reviewed before merge, never auto-merged.

### 4.5 npm Publish Hygiene

- **2FA is required on the `@scout-mobile` npm org.** All publish operations require a TOTP code.
- **Only the `dist/` output is published.** A strict `files` field ensures source, tests, and config are never included:

```json
{
  "files": ["dist/", "README.md", "LICENSE"]
}
```

- **Provenance is enabled.** npm provenance links each published package to the specific GitHub Actions run that built it — users get a verifiable chain from source to package:

```yaml
# .github/workflows/publish.yml
- name: Publish
  run: npm publish --provenance --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- **No publish from local machines.** All releases go through GitHub Actions only.

### 4.6 Automated Security Scanning

- **`npm audit`** runs in CI on every PR. High or critical severity vulnerabilities block merge.
- **`SECURITY.md`** is included in the repo with a responsible disclosure policy and contact method.

### 4.7 Principle of Least Privilege

Scout's MCP server only does what the current task requires:
- No network requests beyond localhost (Metro bundler)
- No file reads outside the project directory and `reportDir`
- No credential, token, or user data storage of any kind
- No telemetry or phone-home behavior

---

## 5. Design Decisions

These were open questions during spec drafting. Decisions are recorded here so Claude Code and contributors have a clear source of truth.

---

### 5.1 Flow targeting: element names vs. coordinates

**Decision: support both, prefer element names. Coordinates are the v1 fallback.**

Element names (`tap: { element: "Sign in button" }`) resolve the target at runtime via the accessibility tree using `idb`. They are robust across screen sizes, orientations, and layout shifts between builds. They require `idb` and depend on the app having accessibility labels set — which React Native does by default for most interactive elements.

Coordinates (`tap: { x: 195, y: 430 }`) are simpler to implement and do not require `idb`, making them viable for Phase 1. They break when layout changes and are tied to a specific device resolution.

**Implementation:** The `flows.yaml` schema supports both syntaxes from day one so no migration is needed when `idb` lands in Phase 2. Element names are the recommended authoring style in documentation. Coordinates are documented as a fallback for cases where accessibility labels are unavailable.

```yaml
# Preferred (Phase 2+)
- tap: { element: "Sign in button" }

# Fallback (Phase 1+)
- tap: { x: 195, y: 430 }
```

---

### 5.2 Layout issue detection strategy

**Decision: heuristics only for v1. Flow assertions in Phase 2. Baseline screenshots deferred.**

Three approaches were considered:

- **Heuristics only** — Claude flags things that are unambiguously broken: text clipped by screen edges, buttons partially off-screen, overlapping elements, invisible text. Requires zero setup and catches real errors, but misses subtle issues.
- **Baseline screenshots** — Scout captures a known-good screenshot per screen on first run and diffs against it on future runs. More accurate but adds setup friction and breaks legitimately on intentional redesigns. Deferred to Phase 3 if demand warrants it.
- **Flow assertions** — the developer defines expected state in `flows.yaml` using `assert: { visible: "..." }`. Claude only flags what has been explicitly defined as expected. Lands in Phase 2 alongside the flow runner.

**v1 implementation:** Heuristics only. Claude receives the screenshot and a prompt describing what constitutes an unambiguous layout failure. No setup required from the developer.

---

### 5.3 Auto-opening crash reports in the editor

**Decision: no for v1. Surface file and line number in the report. Opt-in config in a future version.**

Auto-opening (`code path/to/HomeScreen.tsx:42`) was rejected for v1 because it assumes VS Code or Cursor, assumes the stack trace maps cleanly to source files (React Native stack traces sometimes point to bundled output), and represents Scout taking an unrequested action on the developer's environment.

The in-chat summary and markdown report surface the file path and line number clearly. The developer navigates there. A future opt-in config field (`"autoOpenCrash": true`) can be added if there is demand, with editor specified separately (`"editor": "code" | "cursor" | "webstorm"`).

---

### 5.4 Suggest mode message format

**Decision: short, conversational, with the `/scout test` command hint inline.**

The suggest mode message appears at the end of every completed task when `testMode` is `"suggest"`. It should feel like a natural Claude Code suggestion, not a system notification.

```
Done. This looks like a good checkpoint — run a simulator check? `/scout test`
```

This string is configurable in `claude-mobile.config.json` under `"suggestMessage"` so teams can adjust the wording. The default above is the shipped value.

---

### 5.5 Auto-adding `reportDir` to `.gitignore`

**Decision: auto-add on first run, log a clear message when it happens.**

Reports contain base64-encoded screenshots and will significantly bloat the repository if committed. Documenting this without enforcement will reliably result in at least one large accidental commit per team.

Scout auto-adds `reportDir` to `.gitignore` on first run and logs:

```
Scout: added .claude/mobile-reports/ to .gitignore to prevent report bloat.
```

This is the same pattern used by Next.js (`.next/`), Vercel, and other tools for generated directories. The log message makes the behavior transparent and searchable if a developer questions why the entry appeared.

---

## 6. Testing Strategy

### Approach

Scout has two distinct test layers with different requirements and runners:

- **Unit tests** — fast, no simulator required, run on any platform, use mock adapters. These run on every PR.
- **Integration tests** — require macOS + Xcode + a booted simulator, run in CI on `macos-latest` only, gated to merge to `main`.

The adapter interface pattern is what makes this clean: the core loop, validation, report writer, and flow runner are fully testable in isolation using mock adapters. Only the concrete `IOSSimulatorAdapter` implementation requires a real simulator.

**Test runner:** Vitest — TypeScript-native, fast, compatible with npm workspaces monorepo structure.

### What is unit tested

- **Validation functions** — bundle ID patterns, path traversal prevention, device name sanitization. These are pure functions and cover the security-critical paths.
- **OS detection** — `assertMacOS`, `assertXcodeInstalled`, `assertIdbInstalled`, mocked via `vi.mock('os')` so they run on any platform.
- **Core test loop** — boot → install → launch → screenshot → log → teardown orchestration, including teardown-on-failure behavior, using a mock `PlatformAdapter`.
- **Report writer** — markdown output correctness, severity formatting, no `undefined` or `[object Object]` leaking into output.
- **Flow runner** — step execution order, assertion failure behavior, both element-name and coordinate tap strategies.

### What is integration tested

- `IOSSimulatorAdapter.boot()` — actually boots a named simulator device
- `IOSSimulatorAdapter.screenshot()` — returns a valid non-empty base64 PNG string
- `IOSSimulatorAdapter.logStream()` — returns an array for the requested duration
- `scout_check_environment()` — returns correct environment state on a real macOS machine

Integration tests live in `packages/platform-ios/src/__integration__/` and skip automatically when `process.platform !== 'darwin'`.

### What is not tested

- **Claude's vision interpretation** — whether Claude correctly identifies a red screen or layout issue from a screenshot is a model behavior, not a unit-testable function. Validated manually during development.
- **Metro bundler behavior** — Metro is an external process. Log streaming tests mock the output.

### CI matrix

```yaml
jobs:
  unit:
    runs-on: ubuntu-latest         # every PR
    steps:
      - run: npm ci
      - run: npm run test
      - run: npm audit --audit-level=high

  integration:
    runs-on: macos-latest          # merge to main only
    if: github.ref == 'refs/heads/main'
    steps:
      - run: npm ci
      - run: npm run test:integration
```

---

## 7. Architecture

### Core Principle: Adapter Composition

Scout separates *how to control the runtime environment* from *how to build the app*. These are two independent adapter interfaces that compose at runtime:

```
PlatformAdapter  ×  FrameworkAdapter
─────────────────────────────────────
ios-simulator    ×  react-native     ← v1
android-emulator ×  flutter          ← Phase 2
web              ×  expo             ← Phase 3
```

### Interface Definitions

```typescript
interface PlatformAdapter {
  checkEnvironment(): Promise<EnvironmentReport>
  boot(device?: string): Promise<void>
  install(artifactPath: string): Promise<void>
  launch(bundleId: string): Promise<void>
  screenshot(): Promise<string>                    // base64 PNG
  tap(x: number, y: number): Promise<void>
  swipe(start: Point, end: Point): Promise<void>
  logStream(seconds: number): Promise<string[]>
  accessibilityTree(): Promise<object>
  teardown(): Promise<void>
}

interface FrameworkAdapter {
  build(config: ProjectConfig): Promise<string>    // returns artifact path
  getBundleId(config: ProjectConfig): string
  getMetroLogs?(): Promise<string[]>               // optional, RN-specific
}
```

### npm Package Structure

```
@scout-mobile/core             ← interfaces, loop logic, report writer, MCP server entry
@scout-mobile/platform-ios     ← IOSSimulatorAdapter (simctl + idb)
@scout-mobile/platform-android ← AndroidEmulatorAdapter [Phase 2]
@scout-mobile/framework-rn     ← ReactNativeAdapter
@scout-mobile/framework-flutter← FlutterAdapter [Phase 2]
```

### Repo Structure

```
scout-mobile/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── adapters/
│   │   │   │   ├── PlatformAdapter.ts
│   │   │   │   └── FrameworkAdapter.ts
│   │   │   ├── loop/
│   │   │   │   ├── testLoop.ts
│   │   │   │   └── flowRunner.ts
│   │   │   ├── report/
│   │   │   │   └── reportWriter.ts
│   │   │   ├── validation.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── platform-ios/
│   │   ├── src/
│   │   │   ├── IOSSimulatorAdapter.ts
│   │   │   ├── envChecks.ts
│   │   │   └── __integration__/
│   │   │       └── IOSSimulatorAdapter.integration.test.ts
│   │   └── package.json
│   └── framework-rn/
│       ├── src/
│       │   └── ReactNativeAdapter.ts
│       └── package.json
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── publish.yml
│   └── dependabot.yml
├── SECURITY.md
├── claude-mobile.config.json
├── claude-mobile-flows.yaml
├── SPEC.md
├── README.md
└── package.json
```

---

## 8. MCP Tool Surface

| Tool | Parameters | Returns | Notes |
|---|---|---|---|
| `scout_check_environment` | — | `EnvironmentReport` | Run before any simulator interaction |
| `simulator_boot` | `device?: string` | `void` | Defaults to config device |
| `simulator_install` | `bundlePath: string` | `void` | |
| `simulator_launch` | `bundleId: string` | `void` | |
| `simulator_screenshot` | — | `string` (base64) | PNG, fed into Claude's vision |
| `simulator_tap` | `x: number, y: number` | `void` | |
| `simulator_swipe` | `startX, startY, endX, endY` | `void` | |
| `simulator_log_stream` | `seconds: number` | `string[]` | Metro + system logs |
| `simulator_accessibility_tree` | — | `object` | idb-powered, named element access |
| `simulator_run_flow` | `flowName: string` | `FlowResult` | Reads `flows.yaml` |

---

## 9. Project Configuration

```json
{
  "platform": "ios-simulator",
  "framework": "react-native",
  "testMode": "suggest",
  "suggestMessage": "Done. This looks like a good checkpoint — run a simulator check? `/scout test`",
  "device": "iPhone 16 Pro",
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

`testMode` is configurable globally (Claude Code settings) and per-project (`claude-mobile.config.json`). Per-project overrides global.

---

## 10. User-Defined Flows (`flows.yaml`)

Flows define named test sequences Claude executes step-by-step. Both element names and coordinates are supported. Element names are preferred.

```yaml
flows:
  - name: login
    steps:
      - tap: { element: "Email input" }        # preferred: element name
      - type: { text: "test@example.com" }
      - tap: { element: "Password input" }
      - type: { text: "password123" }
      - tap: { element: "Sign in button" }
      - assert: { visible: "Home screen" }

  - name: onboarding
    steps:
      - swipe: { direction: left }
      - swipe: { direction: left }
      - tap: { x: 195, y: 430 }               # fallback: coordinates
      - assert: { visible: "Dashboard" }
```

Element name resolution uses the accessibility tree via `idb` (Phase 2+). Coordinate tapping is available from Phase 1.

---

## 11. Error Detection

| Category | Detection Method | Phase |
|---|---|---|
| Crashes / red screen | Screenshot vision + Metro error stream | Phase 1 |
| Console / Metro errors | `xcrun simctl spawn booted log stream` | Phase 1 |
| Visual layout issues | Screenshot heuristics via Claude's vision | Phase 1 |
| User flow failures | Flow runner assertion failures | Phase 2 |
| Performance / jank | Frame drop heuristics in system logs | Phase 2 |

Layout detection uses heuristics only in v1 — Claude flags unambiguous failures (clipped text, off-screen elements, overlapping components). Baseline screenshot diffing is deferred to Phase 3 pending demand.

---

## 12. Error Report Format

### In-chat summary

```
📱 Scout Check — 3 issues found
  🔴 Crash: NullPointerException on HomeScreen mount
  🟡 Layout: Button clipped on iPhone SE viewport
  🟡 Console: 2 unhandled promise rejections in auth flow

Full report → .claude/mobile-reports/2026-04-01T14:32.md
```

### Markdown report (written to `reportDir`)

- Timestamp and device/OS info
- Per-issue breakdown with severity
- Full stack traces
- Annotated screenshots (base64 embedded)
- Suggested fixes with code snippets
- Relevant log excerpts

`reportDir` is auto-added to `.gitignore` on first run with a logged message. Reports contain base64 screenshots and must not be committed.

---

## 13. Build Phases

### Phase 0 — Proof of Concept ← *current*
- Scaffold MCP server (`@modelcontextprotocol/sdk` + TypeScript, monorepo-ready)
- Implement `PlatformAdapter` and `FrameworkAdapter` interfaces
- Implement `IOSSimulatorAdapter` with OS and environment checks
- Expose `scout_check_environment` and `simulator_screenshot` tools
- Set up Vitest with unit tests for validation and OS detection
- Validate Claude can describe the simulator UI from a screenshot

**Done when:** Claude Code boots a sim, takes a screenshot, and describes the UI. Unit tests pass on all platforms.

### Phase 1 — MVP Loop
- Implement `ReactNativeAdapter`
- Metro log streaming and crash / red screen detection
- Full build → install → launch → screenshot → log → report loop
- Coordinate-based tap for early flow support
- Unit tests for report writer and test loop

**Done when:** Claude catches a red screen and surfaces a suggested fix.

### Phase 2 — Full Interaction Loop
- `idb` integration for gestures and element-name targeting via accessibility tree
- Flow runner (`simulator_run_flow`, reads `flows.yaml`)
- Flow assertions (`assert: { visible: "..." }`)
- Performance / jank detection
- Integration test suite for `IOSSimulatorAdapter`

**Done when:** Claude executes a named flow end-to-end and reports across all issue categories.

### Phase 3 — Publishable 1.0
- `testMode` fully implemented across all three modes
- `suggestMessage` configurable
- Report writer complete with auto-`.gitignore` behavior
- README and install docs complete
- CI matrix fully green (unit on ubuntu-latest, integration on macos-latest)
- `npm audit` blocking on high/critical in CI
- Example project in repo

**Done when:** A developer can install and be running in under 5 minutes.

### Phase 4 — Public Launch
- Publish `@scout-mobile/*` to npm with provenance
- MCP marketplace listing
- Product Hunt + Hacker News Show HN
- Personal website project page with demo video

---

## 14. Distribution

| Channel | Purpose |
|---|---|
| npm (`@scout-mobile`) | Primary install |
| GitHub (`scout-mobile`) | Source, issues, changelog |
| MCP Marketplace | Claude Code ecosystem discovery |
| Product Hunt | Broader dev audience |
| Hacker News (Show HN) | Technical credibility |
| Personal website | Portfolio + demo video |

---

## 15. Tech Stack

| Concern | Choice |
|---|---|
| Language | TypeScript |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Simulator control | `xcrun simctl` |
| Gestures + a11y tree | `idb` (Meta iOS Device Bridge) |
| Shell execution | `execFileSync` / `spawnSync` — never `exec` with string interpolation |
| RN build | `npx react-native run-ios` |
| Log streaming | `xcrun simctl spawn booted log stream` |
| Test runner | Vitest |
| Monorepo | npm workspaces |
| CI | GitHub Actions |
| Dependency scanning | Dependabot + `npm audit` in CI |
| Package registry | npm (`@scout-mobile` org) |
| License | MIT |

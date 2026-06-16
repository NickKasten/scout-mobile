# Scout — Architecture

## Core Principle: Adapter Composition

Scout separates *how to control the runtime environment* from *how to build the app*. These are two independent adapter interfaces that compose at runtime:

```
PlatformAdapter  ×  FrameworkAdapter
─────────────────────────────────────
ios-simulator    ×  react-native     ← v1
android-emulator ×  react-native     ← Phase 2+ (done)
web              ×  flutter / expo   ← future
```

---

## Interface Definitions

```typescript
interface DeviceInfo {
  udid: string
  name: string
  width: number    // logical points (0 = unknown)
  height: number
}

interface AccessibilityElement {
  type: string                    // "Button", "TextField", "StaticText"
  name: string                    // accessibility label
  value?: string                  // current value for inputs
  frame: { x: number; y: number; width: number; height: number }
  children?: AccessibilityElement[]
}

interface AccessibilityTree {
  elements: AccessibilityElement[]
  raw: string                     // full JSON for debugging
}

interface AdapterMeta {
  displayName: string          // "iOS Simulator" | "Android Emulator"
  installArtifact: string      // ".app bundle" | ".apk"
  gestureToolingNote?: string  // "requires idb" | "" (Android)
}

interface PlatformAdapter {
  readonly meta?: AdapterMeta   // optional + readonly → no breakage for implementers;
                                // drives platform-neutral MCP tool descriptions
  checkEnvironment(): Promise<EnvironmentReport>
  boot(device?: string): Promise<DeviceInfo>
  install(artifactPath: string): Promise<void>
  launch(bundleId: string): Promise<void>
  screenshot(): Promise<{ data: string; mimeType: string }>
  tap(point: Point): Promise<void>
  swipe(from: Point, to: Point): Promise<void>
  logStream(callback: (line: string) => void): Promise<{ stop: () => void }>
  typeText(text: string): Promise<void>
  pressKey(key: string): Promise<void>
  accessibilityTree(): Promise<AccessibilityTree>
  teardown(): Promise<void>
}

interface FrameworkAdapter {
  build(config: ProjectConfig): Promise<string>    // returns artifact path
  getBundleId(config: ProjectConfig): string
  getMetroLogs?(): Promise<string[]>               // optional, RN-specific
}
```

---

## npm Package Structure

```
@scout-mobile/core             ← interfaces, loop logic, report writer, neutral MCP server, resolveTarget
@scout-mobile/platform-ios     ← IOSSimulatorAdapter (simctl + idb)
@scout-mobile/platform-android ← AndroidEmulatorAdapter (adb + emulator + uiautomator) [Phase 2+, done]
@scout-mobile/framework-rn     ← ReactNativeAdapter (xcodebuild + gradlew)
@scout-mobile/framework-flutter← FlutterAdapter [future]
```

The bin (`packages/core/bin/scout.mjs`) calls `resolveTarget(env, osPlatform)`
to pick exactly one platform package, then lazy-loads it. `SCOUT_TARGET` wins;
otherwise macOS → iOS, every other OS → Android. A missing platform package
yields a friendly `npm install` message instead of a stack trace.

---

## Repo Structure

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
│   │   │   ├── server.ts            ← adapter-neutral; registers device_*/simulator_*
│   │   │   ├── targetSelection.ts   ← resolveTarget(env, osPlatform)
│   │   │   └── index.ts
│   │   ├── bin/scout.mjs            ← target selection + lazy platform load
│   │   └── package.json
│   ├── platform-ios/
│   │   ├── src/
│   │   │   ├── IOSSimulatorAdapter.ts
│   │   │   ├── envChecks.ts
│   │   │   └── __integration__/
│   │   │       └── IOSSimulatorAdapter.integration.test.ts
│   │   └── package.json
│   ├── platform-android/
│   │   ├── src/
│   │   │   ├── AndroidEmulatorAdapter.ts
│   │   │   ├── envChecks.ts
│   │   │   ├── deviceDimensions.ts
│   │   │   ├── accessibilityParser.ts
│   │   │   └── __integration__/
│   │   │       └── AndroidEmulatorAdapter.integration.test.ts
│   │   └── package.json
│   └── framework-rn/
│       ├── src/
│       │   └── ReactNativeAdapter.ts   ← xcodebuild (iOS) / gradlew (Android)
│       └── package.json
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── publish.yml
│   └── dependabot.yml
├── SECURITY.md
├── CLAUDE.md
├── SPEC.md
├── docs/
├── claude-mobile.config.json
├── claude-mobile-flows.yaml
├── README.md
└── package.json
```

---

## OS & Environment Detection

`xcrun simctl` is macOS-only — this is a hard platform constraint. OS checks are **per-adapter**, not a global gate, so future Android/Web adapters can run on Windows/Linux without being blocked.

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
    throw new ScoutEnvironmentError('Xcode Command Line Tools not found. Run: xcode-select --install')
  }
}

function assertIdbInstalled(): void {
  try {
    execFileSync('idb', ['--version'], { stdio: 'ignore' })
  } catch {
    throw new ScoutEnvironmentError('idb not found. Run: brew install facebook/fb/idb-companion')
  }
}
```

These checks run once at adapter initialization via `scout_check_environment`.

### Per-Adapter OS Support Matrix

| Adapter | macOS | Windows | Linux |
|---|---|---|---|
| `platform-ios` | ✅ | ❌ clear error message | ❌ clear error message |
| `platform-android` | ✅ | ✅ | ✅ |
| `framework-rn` | ✅ | ✅ | ✅ |
| `framework-flutter` *(future)* | ✅ | ✅ | ✅ |

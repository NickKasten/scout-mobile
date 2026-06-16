# Scout — Testing Strategy

**Current count: 336 unit tests** (any platform).

## Two Test Layers

- **Unit tests** — fast, no device required, run on any platform, use mock adapters and mocked `node:os`/`node:fs`/`node:child_process`. Run on every PR across Ubuntu, macOS, and Windows.
- **Integration tests** — require a real device, gated to merge to `main`:
  - **iOS**: macOS + Xcode + a booted simulator, runs on `macos-latest`.
  - **Android**: `adb` + a booted emulator, runs on `ubuntu-latest` (reliable KVM) via `reactivecircus/android-emulator-runner`.

The adapter interface pattern makes this clean: the core loop, validation, report writer, flow runner, and the neutral MCP server are fully testable in isolation. Only the concrete `IOSSimulatorAdapter` / `AndroidEmulatorAdapter` need a real device — and even their argument arrays are unit-asserted (also a security guard against shell injection).

**Test runner:** Vitest — TypeScript-native, fast, compatible with npm workspaces monorepo.

---

## What is Unit Tested

- **Validation functions** — bundle ID patterns, path traversal prevention, device name sanitization, plus `validateAndroidSerial` / `validateAvdName`. Pure functions covering security-critical paths.
- **OS detection** — iOS `assertMacOS` / `checkXcodeTools` / `checkIdb` and Android `androidHome` / `resolveTool` (`.exe` on win32) / `checkAdb` / `checkEmulator` / `checkAvd`, mocked via `vi.mock('node:os')` so they run on any platform.
- **Adapter-neutral server** — both `device_*` and `simulator_*` names register (27 total), descriptions vary by `AdapterMeta`, neutral fallback when `meta` is absent, aliases marked DEPRECATED.
- **Target selection** — `resolveTarget`: env override wins, darwin → ios, win32/linux → android.
- **Cross-platform** — iOS adapter throws a clean `ScoutEnvironmentError` on win32/linux; `safeResolvePath` traversal cases across separators.
- **Android adapter** — exact `adb`/`emulator` argument arrays, serial threading, keyevent mapping, `.apk`-only install, bounds, `emu kill`, PNG-signature extraction, large-buffer reads.
- **Accessibility parsing** — `uiautomator` XML → `AccessibilityTree`, `findElementByLabel`.
- **Core test loop** — boot → install → launch → screenshot → log → teardown orchestration, including teardown-on-failure behavior, using a mock `PlatformAdapter`.
- **Report writer** — markdown output correctness, severity formatting, no `undefined` or `[object Object]` leaking into output.
- **Flow runner** — step execution order, assertion failure behavior, both element-name and coordinate tap strategies.
- **RN build** — iOS `xcodebuild` args and Android `gradlew assembleDebug` (gradlew.bat on win32), cwd, apk path resolution.

---

## What is Integration Tested

- `IOSSimulatorAdapter` / `AndroidEmulatorAdapter` `boot()` — actually boots a named device/AVD
- `screenshot()` — returns a valid non-empty base64 PNG string (Android also exercises the warning-prefix/large-buffer path)
- `logStream()` — returns lines for the requested duration (system log / logcat)
- `accessibilityTree()` — parses a real device's tree (idb / `uiautomator dump`)
- `scout_check_environment()` — returns correct environment state on a real machine

iOS integration tests live in `packages/platform-ios/src/__integration__/` and skip when `process.platform !== 'darwin'`. Android integration tests live in `packages/platform-android/src/__integration__/`, use `passWithNoTests`, and self-skip when no emulator is attached (`adb devices` empty). Run the Android suite from the package dir (`npm run test:integration:android`) so its relative vitest config resolves.

---

## What is Not Tested

- **Claude's vision interpretation** — whether Claude correctly identifies a red screen or layout issue from a screenshot is a model behavior, not a unit-testable function. Validated manually during development.
- **Metro bundler behavior** — Metro is an external process. Log streaming tests mock the output.

---

## CI Matrix

```yaml
jobs:
  unit:                            # every PR, all three OSes
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - run: npm ci
      - run: npm run build
      - run: npm run typecheck
      - run: npm run test
      - run: npm audit --audit-level=high
      - if: matrix.os == 'ubuntu-latest' || matrix.os == 'windows-latest'
        run: npm run pack:check    # Windows surfaces path/bin/tarball issues

  integration-ios:                 # merge to main only
    runs-on: macos-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - run: npm ci
      - run: npm run build
      - run: npm run test:integration:ios

  integration-android:             # merge to main only
    runs-on: ubuntu-latest         # reliable KVM
    if: github.ref == 'refs/heads/main'
    steps:
      - run: npm ci
      - run: npm run build
      # KVM enable + reactivecircus/android-emulator-runner
      - run: npm run test:integration:android   # inside the emulator action
```

Windows gets unit tests + `pack:check` only (no emulator job — nested-virt is
flaky on hosted Windows runners). Real Windows emulator behavior is verified by
hand via [`manual-test-windows.md`](../manual-test-windows.md).

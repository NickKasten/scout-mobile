# Scout — Testing Strategy

## Two Test Layers

- **Unit tests** — fast, no simulator required, run on any platform, use mock adapters. Run on every PR.
- **Integration tests** — require macOS + Xcode + a booted simulator, run in CI on `macos-latest` only, gated to merge to `main`.

The adapter interface pattern makes this clean: the core loop, validation, report writer, and flow runner are fully testable in isolation using mock adapters. Only the concrete `IOSSimulatorAdapter` requires a real simulator.

**Test runner:** Vitest — TypeScript-native, fast, compatible with npm workspaces monorepo.

---

## What is Unit Tested

- **Validation functions** — bundle ID patterns, path traversal prevention, device name sanitization. Pure functions covering security-critical paths.
- **OS detection** — `assertMacOS`, `assertXcodeInstalled`, `assertIdbInstalled`, mocked via `vi.mock('os')` so they run on any platform.
- **Core test loop** — boot → install → launch → screenshot → log → teardown orchestration, including teardown-on-failure behavior, using a mock `PlatformAdapter`.
- **Report writer** — markdown output correctness, severity formatting, no `undefined` or `[object Object]` leaking into output.
- **Flow runner** — step execution order, assertion failure behavior, both element-name and coordinate tap strategies.

---

## What is Integration Tested

- `IOSSimulatorAdapter.boot()` — actually boots a named simulator device
- `IOSSimulatorAdapter.screenshot()` — returns a valid non-empty base64 PNG string
- `IOSSimulatorAdapter.logStream()` — returns an array for the requested duration
- `scout_check_environment()` — returns correct environment state on a real macOS machine

Integration tests live in `packages/platform-ios/src/__integration__/` and skip automatically when `process.platform !== 'darwin'`.

---

## What is Not Tested

- **Claude's vision interpretation** — whether Claude correctly identifies a red screen or layout issue from a screenshot is a model behavior, not a unit-testable function. Validated manually during development.
- **Metro bundler behavior** — Metro is an external process. Log streaming tests mock the output.

---

## CI Matrix

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

# idb Setup & Integration Findings

Findings from debugging `simulator_tap` and `simulator_swipe` MCP tool failures (April 2026).

## Key Discoveries

### idb requires two components

- **`idb_companion`** — native macOS daemon (gRPC server), installed via Homebrew from the `facebook/fb` tap
- **`fb-idb`** — Python CLI client that talks to the companion, installed via pip

Both are required. The companion alone is not enough — `idb` is the Python CLI.

Install steps (verified on macOS 26 / Xcode 26.2):

```bash
brew tap facebook/fb && brew install idb-companion && pip3 install fb-idb
```

The SPEC previously only mentioned `brew install facebook/fb/idb-companion` and omitted the Python client.

### `idb --version` is not a valid command

`fb-idb` doesn't support `--version` — it exits with error code 2. This caused Scout's `assertIdbInstalled()` and `checkIdb()` to incorrectly report idb as missing even when properly installed.

**Fix**: Use `idb --help` for presence detection instead.

### `idb` doesn't support `booted` as a UDID alias

Unlike `xcrun simctl` (which accepts `booted` as a device specifier), `idb` requires the actual device UDID. Without `--udid <UDID>`, idb can't find the target simulator.

**Fix**: Resolve the UDID via `xcrun simctl list devices booted -j` and pass it with `--udid` to all idb commands.

### Default device name may need updating

`iPhone 16 Pro` doesn't exist on iOS 26+. Should be updated to `iPhone 17 Pro` or made configurable via environment variable or MCP tool parameter.

### `idb_companion` maintenance status

Last release: August 2022 (v1.1.8). It still works on iOS 26 but is effectively unmaintained. Worth noting for future risk assessment and potential migration to alternative tools.

## SPEC Sections to Update

- **Section 4.1 (Environment Checks)**: Update idb detection method from `--version` to `--help`
- **idb install instructions**: Include both `idb_companion` and `fb-idb`, with the `facebook/fb` tap
- **Phase 1 scope notes**: Document the UDID requirement for idb commands

# Changelog

All notable changes to Scout Mobile are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [0.2.3] — 2026-04-26

### Changed
- Upgrade CI to Node 22 and GitHub Actions v6
- Require Node 22+ (previously Node 20+)

### Stats
- 202 unit tests, 14 MCP tools

## [0.2.0] — 2026-04-21

### Added
- Flow runner system with YAML-based test definitions (`simulator_run_flow` MCP tool)
- YAML parser for `flows.yaml` with flow assertions (supports element names and coordinates)
- Frame-timing jank detection module
- Windows CI — unit tests now run on both Ubuntu and Windows
- Integration test scaffold for `platform-ios`

### Fixed
- `writeReport` path prefix check used `/` instead of `path.sep`, breaking Windows

### Stats
- 14 MCP tools, 201 unit tests

## [0.1.0] — 2026-04-13

### Added
- MCP server with 13 tools: environment check, simulator boot/install/launch, screenshot, tap, swipe, log stream, type text, press key, clear text, tap element, accessibility tree
- `PlatformAdapter` × `FrameworkAdapter` dual-interface architecture
- `IOSSimulatorAdapter` with device awareness, bounds checking, and UDID targeting
- `ReactNativeAdapter` with xcodebuild integration
- Report writer with auto-`.gitignore`
- Input validation with regex allowlists
- CI pipeline (Ubuntu unit tests, macOS integration tests)
- npm publish workflow with provenance

### Stats
- 13 MCP tools, 143 unit tests

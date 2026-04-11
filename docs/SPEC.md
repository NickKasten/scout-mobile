# Scout — Software Design Document

> **Package:** `@scout-mobile/core`
> **License:** MIT
> **Author:** Nicholas Kasten
> **Status:** Phase 2 — Active Development

---

## Overview

Scout is a Claude Code MCP plugin that closes the iOS Simulator iteration loop for React Native developers on macOS. It gives Claude Code the ability to boot a simulator, install and launch an app, interact with the UI, observe runtime state, and surface errors — all without leaving the editor.

> *iOS Simulator iteration loop for Claude Code — for React Native and beyond.*

---

## Goals

- Give Claude Code eyes and hands inside the iOS Simulator
- Surface crashes, layout issues, console errors, and flow failures — with suggested fixes
- Never run without intent: manual trigger or user-confirmed suggestion only
- Extensible from day one: iOS + React Native are the first implementation, not the architecture
- Proper open source npm package usable by the wider React Native / Claude Code community

**Non-goals (v1):** Android, Flutter/Expo/SwiftUI, CI/CD integration, remote device testing

---

## Quick Reference

| Question | Read |
|---|---|
| Implementing or modifying an MCP tool? | [docs/active-spec-docs/mcp-tools.md](docs/active-spec-docs/mcp-tools.md) |
| Architecture, adapters, interfaces, package structure? | [docs/active-spec-docs/architecture.md](docs/active-spec-docs/architecture.md) |
| Current phase status, what's done, what's next? | [docs/active-spec-docs/phases.md](docs/active-spec-docs/phases.md) |
| Security, command injection, publish hygiene? | [docs/active-spec-docs/security-plan.md](docs/active-spec-docs/security-plan.md) |
| Why a decision was made (flows, layout detection, etc.)? | [docs/active-spec-docs/decisions.md](docs/active-spec-docs/decisions.md) |
| Testing approach, unit vs integration, CI matrix? | [docs/active-spec-docs/testing.md](docs/active-spec-docs/testing.md) |
| Error detection categories or report format? | [docs/active-spec-docs/error-handling.md](docs/active-spec-docs/error-handling.md) |

---

## Tech Stack

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

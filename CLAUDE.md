# CLAUDE.md — Scout

Scout is a Claude Code MCP plugin for iOS Simulator control.
**npm:** @scout-mobile | **Phase:** 2 | **Tests:** 201

## Commands

- `npm ci` — install (CI) / `npm install` (local)
- `npm run build` — compile TypeScript (per-package via `tsc --build`)
- `npm run test` — unit tests via Vitest (201 tests, any platform)
- `npm run test:integration` — macOS only, requires Xcode + booted sim
- `npm audit --audit-level=high` — security audit (blocks on high/critical in CI)

## Context Loading Guide

Only load what the current task needs. Do not load everything.

| Working on... | Read |
|---|---|
| MCP tool (add/change/fix) | docs/active-spec-docs/mcp-tools.md |
| Adapters, packages, OS detection | docs/active-spec-docs/architecture.md |
| Phase checklist, what's done/next | docs/active-spec-docs/phases.md |
| Security: shell, validation, publish | docs/active-spec-docs/security-plan.md |
| Why a design decision was made | docs/active-spec-docs/decisions.md |
| Test coverage, CI, Vitest | docs/active-spec-docs/testing.md |
| Error detection or report format | docs/active-spec-docs/error-handling.md |
| Full project overview | docs/SPEC.md |

## Locked Decisions — Do Not Re-Litigate

These are settled. If you think one needs revisiting, flag it as a comment; don't silently deviate.

- **Monorepo with npm workspaces**, `packages/` directory structure
- **`PlatformAdapter` × `FrameworkAdapter` dual-interface composition** — the core architectural pattern
- **`xcrun simctl` for iOS control, `idb` for gestures and accessibility tree**
- **OS detection is per-adapter, not a global gate** — Android adapter can run on Windows/Linux
- **`execFileSync` with args array always** — never `execSync` with string interpolation
- **`flows.yaml` supports both element names and coordinates** — element names preferred, coordinates are the fallback
- **Layout detection is heuristics-only for v1** — baseline screenshot diffing deferred to Phase 3
- **No auto-opening crash files in editor for v1** — surface path + line number in report only
- **`reportDir` auto-added to `.gitignore` on first run**
- **Zero runtime dependencies for `@scout-mobile/core`** — `@modelcontextprotocol/sdk` is the one exception
- **All releases via GitHub Actions only** — no local `npm publish`

## Workflow

- After completing a development plan and verifying tests pass, stage, commit, and push the changes.

## Security Essentials

- Shell: `execFileSync(cmd, [args])` always — never string interpolation
- Validate all user-supplied values with regex allowlists before use
- Path traversal: `resolve()` + prefix-check for file paths
- Full policy: docs/active-spec-docs/security-plan.md

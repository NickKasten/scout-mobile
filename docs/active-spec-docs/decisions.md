# Scout — Design Decisions

Decisions recorded here so Claude Code and contributors have a clear source of truth. Do not re-litigate these without a documented reason.

---

## 5.1 Flow targeting: element names vs. coordinates

**Decision: support both, prefer element names. Coordinates are the v1 fallback.**

Element names (`tap: { element: "Sign in button" }`) resolve at runtime via the accessibility tree using `idb`. Robust across screen sizes, orientations, and layout shifts. Requires `idb` and accessibility labels (React Native sets these by default for most interactive elements).

Coordinates (`tap: { x: 195, y: 430 }`) are simpler and don't require `idb`, making them viable for Phase 1. They break on layout changes and are device-resolution specific.

**Implementation:** `flows.yaml` supports both syntaxes from day one — no migration needed when `idb` lands. Element names are the recommended authoring style; coordinates are the documented fallback.

---

## 5.2 Layout issue detection strategy

**Decision: heuristics only for v1. Flow assertions in Phase 2. Baseline screenshots deferred.**

- **Heuristics** — Claude flags unambiguously broken things: text clipped, buttons off-screen, overlapping elements. Zero setup. Misses subtle issues.
- **Baseline screenshots** — diff against a known-good screenshot. More accurate but adds friction and breaks on intentional redesigns. Deferred to Phase 3 if demand warrants.
- **Flow assertions** — developer defines expected state in `flows.yaml` via `assert: { visible: "..." }`. Lands in Phase 2 alongside the flow runner.

**v1:** Heuristics only. Claude receives the screenshot and a prompt describing unambiguous failure criteria. No developer setup required.

---

## 5.3 Auto-opening crash reports in the editor

**Decision: no for v1. Surface file + line number in the report. Opt-in config in a future version.**

Auto-opening (`code path/to/HomeScreen.tsx:42`) was rejected for v1 because: assumes VS Code or Cursor, assumes stack traces map cleanly to source files (RN traces sometimes point to bundled output), and represents Scout taking an unrequested action on the developer's environment.

Future opt-in: `"autoOpenCrash": true` + `"editor": "code" | "cursor" | "webstorm"`.

---

## 5.4 Suggest mode message format

**Decision: short, conversational, with the `/scout test` command hint inline.**

```
Done. This looks like a good checkpoint — run a simulator check? `/scout test`
```

Configurable via `"suggestMessage"` in `claude-mobile.config.json`. The string above is the shipped default.

---

## 5.5 Auto-adding `reportDir` to `.gitignore`

**Decision: auto-add on first run, log a clear message when it happens.**

Reports contain base64-encoded screenshots and will significantly bloat the repo if committed. Documenting without enforcement reliably produces accidental large commits.

Scout auto-adds `reportDir` to `.gitignore` on first run and logs:
```
Scout: added .claude/mobile-reports/ to .gitignore to prevent report bloat.
```

Same pattern as Next.js (`.next/`), Vercel, and similar tools. Transparent and searchable.

---

## 5.6 Adapter-neutral tool naming: `device_*` canonical, `simulator_*` deprecated alias

**Decision: register every operation under a canonical `device_*` name and a `simulator_*` alias.**

Phase 2+ generalizes Scout beyond iOS, so the iOS-flavored `simulator_*` names no
longer fit Android. Rather than rename (a breaking change for existing `.mcp.json`
setups and flows), each handler is registered twice: the canonical `device_*` name
and the `simulator_*` alias (description prefixed `[DEPRECATED alias for …]`). Same
handler, same zod schema. `scout_check_environment` stays single-registered. Tool
descriptions are rebuilt from the adapter's optional `AdapterMeta` so they read
correctly per platform (`.apk` vs `.app bundle`, idb note vs none).

---

## 5.7 Android coordinates: physical pixels

**Decision: Android tap/swipe coordinates are physical pixels; iOS stays logical points.**

`adb input tap/swipe` operates in physical device pixels natively, and
`uiautomator` bounds are reported in pixels too — so using pixels avoids a
lossy conversion and matches what the tooling expects. iOS keeps logical points
(what `idb` uses). The divergence is documented in the tool descriptions and
README so flow authors know which space a given platform's coordinates live in.

---

## 5.8 Install model: dependency-free core + per-target platform package

**Decision: `@scout-mobile/core` stays dependency-free; the bin lazy-loads only the selected platform package.**

`SCOUT_TARGET` (or the OS default) selects the target, and the bin imports only
that platform package. If it isn't installed, Scout prints a friendly,
copy-pasteable `npm install` message and exits cleanly — no stack trace. This
keeps core lean, lets users install just the platform(s) they need, and leaves
existing Mac users (who already have `platform-ios`) unaffected.

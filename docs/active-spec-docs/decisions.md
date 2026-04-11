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

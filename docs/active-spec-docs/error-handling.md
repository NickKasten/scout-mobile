# Scout — Error Detection & Reports

## Error Detection

| Category | Detection Method | Phase |
|---|---|---|
| Crashes / red screen | Screenshot vision + Metro error stream | Phase 1 |
| Console / Metro errors | `xcrun simctl spawn booted log stream` | Phase 1 |
| Visual layout issues | Screenshot heuristics via Claude's vision | Phase 1 |
| User flow failures | Flow runner assertion failures | Phase 2 |
| Performance / jank | Frame drop heuristics in system logs | Phase 2 |

Layout detection uses heuristics only in v1 — Claude flags unambiguous failures (clipped text, off-screen elements, overlapping components). Baseline screenshot diffing is deferred to Phase 3 pending demand.

---

## In-Chat Summary Format

```
📱 Scout Check — 3 issues found
  🔴 Crash: NullPointerException on HomeScreen mount
  🟡 Layout: Button clipped on iPhone SE viewport
  🟡 Console: 2 unhandled promise rejections in auth flow

Full report → .claude/mobile-reports/2026-04-01T14:32.md
```

---

## Markdown Report (written to `reportDir`)

Each report contains:
- Timestamp and device/OS info
- Per-issue breakdown with severity
- Full stack traces
- Annotated screenshots (base64 embedded)
- Suggested fixes with code snippets
- Relevant log excerpts

`reportDir` is auto-added to `.gitignore` on first run. Reports contain base64 screenshots and must not be committed.

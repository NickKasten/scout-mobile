# Scout Development Loop — Issue Log

## Baseline Issues

### ISSUE-001: simulator_boot fails with multiple devices of same name
- **Severity:** blocker
- **Phase:** build
- **Tool(s):** simulator_boot
- **Problem:** `simulator_boot` with device name "iPhone 17 Pro" fails when multiple simulator runtimes (iOS 26.0, 26.1, 26.2) each have a device with that name. Error: "Command failed: xcrun simctl boot iPhone 17 Pro"
- **Workaround:** Boot the simulator manually or use `xcrun simctl boot <UDID>` directly. Rely on already-booted device.
- **Scout improvement:** Accept optional UDID parameter, or auto-select the highest OS version when multiple devices share a name. Also handle "already booted" gracefully (not as error).

### ISSUE-002: simulator_screenshot may lag behind accessibility tree state
- **Severity:** friction
- **Phase:** verify
- **Tool(s):** simulator_screenshot, simulator_accessibility_tree
- **Problem:** After login flow (tap + type + tap), accessibility tree correctly showed Home screen (Welcome!, items), but screenshot still showed Login screen. Likely a render timing issue — screenshot captured before the UI fully transitioned.
- **Workaround:** Take screenshot again after a brief pause, or trust accessibility tree over screenshot for state verification.
- **Scout improvement:** Add optional delay parameter to screenshot, or provide a "wait for element" primitive that polls accessibility tree before capturing.

### ISSUE-003: simulator_log_stream returns only system logs, no app logs
- **Severity:** friction
- **Phase:** verify
- **Tool(s):** simulator_log_stream
- **Problem:** 3-second log stream captured only `locationd` system noise. No `[ScoutTest]` console.log lines from the React Native app appeared, despite the app being active.
- **Workaround:** Check Metro terminal output manually for JS console logs.
- **Scout improvement:** Filter log stream by process name or bundle ID (e.g., `--predicate 'process == "ScoutTestLogin"'`). Or provide a separate tool for Metro/JS log capture.

### ISSUE-004: System "Save Password?" dialog blocks interaction after login
- **Severity:** friction
- **Phase:** interact
- **Tool(s):** simulator_tap, simulator_accessibility_tree
- **Problem:** After successful login, iOS presents a "Save Password?" system dialog that blocks interaction with the app. Must be dismissed before proceeding. Not visible in the accessibility tree from the app's perspective.
- **Workaround:** Tap "Not Now" at known coordinates. Could also check screenshot for dialog presence.
- **Scout improvement:** Provide a `simulator_dismiss_alert` tool, or auto-detect and dismiss system dialogs. Alternatively, document common system interruptions.

### ISSUE-005: Multiple booted simulators cause idb/simctl mismatch
- **Severity:** blocker
- **Phase:** interact
- **Tool(s):** simulator_tap, simulator_type_text, simulator_screenshot
- **Problem:** When two iPhone 17 Pro simulators were booted (iOS 26.0 and 26.2), idb sent tap/type events to one while simctl screenshot captured the other. All interactions appeared to fail — text didn't appear in screenshots despite being typed on the wrong device.
- **Workaround:** Manually shut down extra simulators so only one device is booted.
- **Scout improvement:** Scout should detect multiple booted devices and warn. Or always use UDID-targeted commands instead of relying on "booted" keyword.

### ISSUE-006: Text clearing requires manual character counting with deleteBackspace
- **Severity:** friction
- **Phase:** interact
- **Tool(s):** simulator_press_key, simulator_type_text
- **Problem:** `simulator_type_text` only appends text. To clear a field, you must press `deleteBackspace` once per character, requiring you to know the exact character count. For "Item 25" (7 chars), that's 7 individual `press_key` calls. Error-prone and verbose.
- **Workaround:** Count characters carefully and issue N individual deleteBackspace presses. Alternatively, use select-all (Cmd+A) then delete — but Scout doesn't support modifier key combos.
- **Scout improvement:** Add `simulator_clear_text` tool that selects all and deletes, or `simulator_set_value` that replaces field contents. This is the #1 friction point for text-heavy test flows.

### ISSUE-007: Alert button coordinates differ between a11y tree and visual rendering
- **Severity:** friction
- **Phase:** interact
- **Tool(s):** simulator_tap, simulator_accessibility_tree
- **Problem:** Alert "OK" button's a11y tree position (y=487) was drastically different from its apparent visual position (visually appeared ~y=840). Multiple taps at the visual location failed. Only the a11y tree coordinates worked.
- **Workaround:** Always use accessibility tree to find alert button coordinates, never estimate from screenshots.
- **Scout improvement:** Add `simulator_dismiss_alert` tool that auto-detects and taps alert buttons. Or provide a "tap by accessibility label" tool that doesn't require coordinate calculation.

### ISSUE-008: Swipe action buttons always present in a11y tree even when hidden
- **Severity:** cosmetic
- **Phase:** verify
- **Tool(s):** simulator_accessibility_tree
- **Problem:** "Archive Item N" and "Delete Item N" buttons appear in the accessibility tree for every card even when not swiped (positioned behind the card at lower z-index). This makes the a11y tree 3x longer and harder to parse.
- **Workaround:** Not needed — this is actually beneficial since actions can be tapped via a11y coordinates without requiring the swipe gesture to work.
- **Scout improvement:** Consider providing a filtered a11y tree view that only shows visible/interactive elements. Or add element visibility/occlusion data to the tree.

### ISSUE-009: Swipe gesture works but requires precise horizontal movement
- **Severity:** cosmetic
- **Phase:** interact
- **Tool(s):** simulator_swipe
- **Problem:** The idb swipe successfully triggered PanResponder's horizontal gesture detection. The 200pt horizontal swipe (350→150) cleared the 80pt threshold. No issues with swipe duration (0.5s default was fine).
- **Workaround:** None needed — worked as expected.
- **Scout improvement:** The plan predicted swipe would be high-risk, but it worked well. The PanResponder dx/dy threshold (10pt, dx > dy) was generous enough for programmatic swipes.

### ISSUE-010: System dialogs invisible to app-level accessibility tree
- **Severity:** friction
- **Phase:** interact
- **Tool(s):** simulator_accessibility_tree
- **Problem:** When iOS system dialogs appear (e.g., "Save Password?"), `simulator_accessibility_tree` returns only `[Application] "ScoutTestLogin" at (0,0) size 402x874` with no children. The dialog's buttons are not discoverable via the a11y tree.
- **Workaround:** Estimate button positions from screenshots or use trial-and-error tapping.
- **Scout improvement:** The accessibility tree should include system-level UI elements (alerts, dialogs, keyboards). Or provide a separate `simulator_system_alert_tree` tool.

### ISSUE-011: run-ios may target wrong simulator when multiple share a name
- **Severity:** friction
- **Phase:** build
- **Tool(s):** workflow (npx react-native run-ios)
- **Problem:** `npx react-native run-ios --simulator="iPhone 17 Pro"` with 4 devices named "iPhone 17 Pro" across iOS versions may install on a different one than the booted device. Build output listed many devices but doesn't confirm which was targeted.
- **Workaround:** Ensure only one device with the target name exists, or use `--udid` flag.
- **Scout improvement:** Scout should expose the booted device's UDID so it can be passed to build commands. The `simulator_boot` response should include this.

---

## Summary

**Total issues:** 11 (2 blockers, 6 friction, 3 cosmetic)

### Top Priority Improvements for Scout

| Priority | Issue | Improvement |
|----------|-------|-------------|
| 1 | ISSUE-005 | Detect/prevent multiple booted simulators; use UDID-targeted commands |
| 2 | ISSUE-001 | Accept UDID in `simulator_boot`; handle "already booted" gracefully |
| 3 | ISSUE-006 | Add `simulator_clear_text` or `simulator_set_value` tool |
| 4 | ISSUE-003 | Filter `simulator_log_stream` by bundle ID or add Metro log capture |
| 5 | ISSUE-007/010 | Add `simulator_dismiss_alert` or `simulator_tap_label` tool |
| 6 | ISSUE-008 | Add visibility filtering to accessibility tree |

### What Worked Well
- `simulator_type_text` — reliable once targeting correct device
- `simulator_swipe` — PanResponder gestures triggered successfully (contrary to risk predictions)
- `simulator_accessibility_tree` — accurate element positions, essential for coordinate targeting
- Hot reload — all code changes applied instantly without rebuild
- Dark mode tokens pattern — single change point, consistent across all screens

### Development Loop Assessment
The Scout MCP tools are functional for iterative app development. The primary friction points are **device targeting ambiguity** (issues 1, 5, 11) and **text input management** (issue 6). Once the single-booted-device constraint is met, the tap→type→screenshot→a11y loop works reliably. The accessibility tree is more trustworthy than screenshots for state verification.

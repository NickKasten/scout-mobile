# Manual Test Script — Scout on Windows (Android)

Scout's automated CI covers Windows **unit tests** and `pack:check`, but the
real Android emulator path on Windows is verified by hand because GitHub's
Windows runners can't reliably nest-virtualize an emulator. Run this script on a
Windows machine (or a cloud Windows VM that exposes nested virtualization, e.g.
Azure `Dv5`/`Dv4` with nested virt, AWS `*.metal`, or GCP with nested virt
enabled) and report back using the template at the bottom.

> **Coordinates note:** Scout reports Android coordinates in **physical pixels**
> (matching `adb input`), unlike iOS which uses logical points. A `tap` at
> `(x, y)` maps directly to the device's pixel grid.

---

## 0. Prerequisites

- Node.js **>= 22** (`node --version`)
- Android SDK installed (Android Studio or command-line tools)
- `ANDROID_HOME` set to the SDK root, e.g.
  `setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"` (reopen the shell afterward)
- `platform-tools` (adb) and `emulator` packages installed via the SDK Manager
- At least one AVD created (Android Studio → Device Manager, or `avdmanager`)

Verify tooling resolves:

```powershell
echo $env:ANDROID_HOME
& "$env:ANDROID_HOME\platform-tools\adb.exe" version
& "$env:ANDROID_HOME\emulator\emulator.exe" -list-avds
```

Expected: a version string from adb and at least one AVD name listed.

---

## 1. Install Scout for Android

```powershell
npm install @scout-mobile/core @scout-mobile/platform-android @scout-mobile/framework-rn
```

> If you only install `@scout-mobile/core` and run with `SCOUT_TARGET=android`,
> Scout should print a friendly install message and exit — **not** a stack
> trace. That negative path is checked in step 8.

---

## 2. Wire up the MCP server (`.mcp.json`)

In your project root, add Scout to `.mcp.json`:

```json
{
  "mcpServers": {
    "scout": {
      "command": "node",
      "args": ["./node_modules/@scout-mobile/core/bin/scout.mjs"],
      "env": {
        "SCOUT_TARGET": "android",
        "SCOUT_BUNDLE_ID": "com.yourcompany.yourapp"
      }
    }
  }
}
```

On Windows (non-macOS), `SCOUT_TARGET` defaults to `android` even if omitted, but
set it explicitly for clarity.

---

## 3. Environment check

In Claude Code, run the `scout_check_environment` tool.

Expected: a report with **Android SDK ✓** and **adb ✓** (required). `emulator`
and `AVD` may be ✓ or warnings — they're optional. No exception/stack trace.

---

## 4. Boot an AVD

Either boot via the `device_boot` (or `simulator_boot`) tool with your AVD name,
or manually:

```powershell
& "$env:ANDROID_HOME\emulator\emulator.exe" -avd <YourAvdName> -no-snapshot -no-boot-anim
```

Wait until boot completes:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" shell getprop sys.boot_completed
```

Expected: prints `1`. `adb devices` shows your emulator serial (e.g.
`emulator-5554   device`).

---

## 5. Install & launch the app

If you have a debug APK (e.g. from `gradlew.bat assembleDebug`):

- `device_install` (or `simulator_install`) with the path to `app-debug.apk`
- `device_launch` (or `simulator_launch`) with your bundle ID

Expected: app installs without error and appears on the emulator screen.

---

## 6. Screenshot

Run `device_screenshot` (or `simulator_screenshot`).

Expected: a valid PNG is returned (image renders; not corrupted). This exercises
the large-buffer + PNG-signature handling that earlier bit a foldable emulator.

---

## 7. Interaction + logs + flow

- `device_tap` / `device_type_text` / `device_press_key` against visible UI
- `device_accessibility_tree` — returns a parsed uiautomator tree (element
  types, names, bounds)
- `device_log_stream` — captures logcat lines for a few seconds
- `simulator_run_flow` — run a small `flows.yaml` flow end to end

Expected: each tool succeeds; taps land on the right pixel coordinates; the
accessibility tree lists on-screen elements; logcat lines appear.

---

## 8. Missing-package friendly message (negative path)

In a scratch directory with **only** `@scout-mobile/core` installed:

```powershell
$env:SCOUT_TARGET = "android"
node .\node_modules\@scout-mobile\core\bin\scout.mjs
```

Expected output (no stack trace), then a clean exit:

```
Scout Android Emulator support requires the android platform adapter.
Install it with:

  npm install @scout-mobile/platform-android
```

---

## Report-back template

```
Machine:            (physical Windows / cloud VM + type)
Windows version:
Node version:
ANDROID_HOME:       (set? path)
AVD used:

[ ] 0. Prereqs verified (adb version, emulator -list-avds)
[ ] 1. Install succeeded
[ ] 2. .mcp.json wired
[ ] 3. scout_check_environment: SDK ✓ adb ✓ (no stack trace)
[ ] 4. AVD booted, getprop sys.boot_completed == 1
[ ] 5. APK install + launch
[ ] 6. Screenshot is a valid PNG
[ ] 7. tap / type / press / a11y tree / logcat / run_flow
[ ] 8. Missing-package message prints (no stack trace), exit code 1

Failures / surprises (paste exact output):


Anything that looked Windows-specific (path separators, .exe resolution, CRLF):

```

# @scout-mobile/platform-android

Android Emulator platform adapter for [Scout](https://github.com/nicholaskasten/scout-mobile). Wraps `adb`, the `emulator` CLI, and `uiautomator` to provide device boot, app install/launch, screenshots, gestures, and accessibility inspection. Runs on macOS, Windows, and Linux.

## Install

```bash
npm install @scout-mobile/platform-android
```

## Requirements

- [Android SDK](https://developer.android.com/studio) with `platform-tools` (adb) and `emulator`
- `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) pointing at the SDK install
- At least one AVD (created via Android Studio or `avdmanager`)

## Coordinates

Unlike the iOS adapter (logical points), the Android adapter uses **physical pixels** for `tap`/`swipe`/`screenshot`, matching `adb input` natively.

## Usage

This package is used internally by `@scout-mobile/core`. You generally don't need to install it directly unless building a custom adapter.

```typescript
import { AndroidEmulatorAdapter } from '@scout-mobile/platform-android';
```

## License

AGPL-3.0 -- see [LICENSE](./LICENSE).

Part of the [scout-mobile](https://github.com/nicholaskasten/scout-mobile) monorepo.

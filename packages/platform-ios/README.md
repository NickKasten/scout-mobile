# @scout-mobile/platform-ios

iOS Simulator platform adapter for [Scout](https://github.com/nicholaskasten/scout-mobile). Wraps `xcrun simctl` and `idb` to provide device boot, app install/launch, screenshots, gestures, and accessibility inspection.

## Install

```bash
npm install @scout-mobile/platform-ios
```

## Requirements

- macOS
- Xcode with iOS Simulator
- [idb](https://fbidb.io/) for tap, swipe, text input, and accessibility tree

## Usage

This package is used internally by `@scout-mobile/core`. You generally don't need to install it directly unless building a custom adapter.

```typescript
import { IosPlatformAdapter } from '@scout-mobile/platform-ios';
```

## License

AGPL-3.0 -- see [LICENSE](./LICENSE).

Part of the [scout-mobile](https://github.com/nicholaskasten/scout-mobile) monorepo.

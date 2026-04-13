# @scout-mobile/core

MCP server for AI-driven iOS Simulator control. Provides tools for screenshotting, tapping, swiping, typing, and inspecting the accessibility tree of iOS Simulator devices.

## Install

```bash
npm install @scout-mobile/core
```

## Usage

```typescript
import { createScoutServer } from '@scout-mobile/core';

const server = createScoutServer();
```

### CLI

Scout includes a CLI binary for running the MCP server directly:

```bash
npx @scout-mobile/core
```

## Requirements

- Node.js >= 20
- macOS with Xcode and iOS Simulator
- [idb](https://fbidb.io/) for gesture and accessibility tree support

## License

AGPL-3.0 -- see [LICENSE](./LICENSE).

Part of the [scout-mobile](https://github.com/nicholaskasten/scout-mobile) monorepo.

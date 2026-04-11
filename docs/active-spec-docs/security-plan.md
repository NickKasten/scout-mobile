# Scout — Security Architecture

The npm ecosystem has a well-documented vulnerability problem rooted in transitive dependency bloat, poor publish hygiene, and unsafe shell execution. Scout is designed to not contribute to this.

---

## Dependency Minimalism

Every dependency is a potential attack surface. Scout's policy:

- **No dependency is added without explicit justification.** Each dep must be documentable: what it does, why a native alternative doesn't work, and what the security posture is.
- **Prefer Node built-ins over third-party packages.** `child_process`, `fs`, `os`, and `path` cover most of what Scout needs.
- **Zero runtime dependencies is the target for `@scout-mobile/core`.** Interfaces, loop logic, and report writer should require no external packages.
- **`@modelcontextprotocol/sdk`** is the one justified exception — it is the MCP protocol implementation maintained by Anthropic.
- **Dev dependencies are never shipped.** TypeScript, tsx, and test tooling live in `devDependencies` only.

---

## Command Injection Prevention

Scout shells out to `simctl` and `idb` constantly. Every shell invocation is a potential injection vector if user-supplied values are interpolated.

**Rule: never use string interpolation for shell commands.**

```typescript
// ❌ NEVER — injectable
execSync(`xcrun simctl boot ${deviceId}`)

// ✅ ALWAYS — array form, no shell interpolation
import { execFileSync } from 'child_process'
execFileSync('xcrun', ['simctl', 'boot', deviceId])
```

`execFileSync` with an args array bypasses the shell entirely. No special characters in `deviceId` can escape the argument boundary.

**All user-supplied values must be validated before use:**

```typescript
const BUNDLE_ID_PATTERN = /^[a-zA-Z0-9\-\.]+$/

function validateBundleId(id: string): string {
  if (!BUNDLE_ID_PATTERN.test(id)) {
    throw new ScoutValidationError(`Invalid bundle ID: ${id}`)
  }
  return id
}
```

Values requiring validation: device names, bundle IDs, flow names, file paths, Metro port.

---

## Path Traversal Prevention

Scout writes to `reportDir` and reads flows from a user-specified path. Both must be validated.

```typescript
import { resolve } from 'path'

function safeReportPath(reportDir: string, filename: string): string {
  const base = resolve(reportDir)
  const target = resolve(reportDir, filename)
  if (!target.startsWith(base + '/')) {
    throw new ScoutValidationError('Path traversal detected in report filename')
  }
  return target
}
```

---

## Lockfile Discipline

- **`package-lock.json` is committed and never gitignored.** Pins the exact resolved dependency tree; diffs are auditable.
- **`npm ci` in CI**, not `npm install`. Enforces lockfile exactly and fails rather than silently updating.
- **Dependabot enabled** with weekly checks. Dependency update PRs are reviewed before merge, never auto-merged.

---

## npm Publish Hygiene

- **2FA required on the `@scout-mobile` npm org.** All publish operations require TOTP.
- **Only `dist/` is published.** Strict `files` field in `package.json`:

```json
{
  "files": ["dist/", "README.md", "LICENSE"]
}
```

- **Provenance enabled.** Links each published package to the specific GitHub Actions run that built it:

```yaml
# .github/workflows/publish.yml
- name: Publish
  run: npm publish --provenance --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- **No publish from local machines.** All releases go through GitHub Actions only.

---

## Automated Scanning

- **`npm audit`** runs in CI on every PR. High or critical severity vulnerabilities block merge.
- **`SECURITY.md`** in the repo with responsible disclosure policy and contact method.

---

## Principle of Least Privilege

Scout's MCP server only does what the current task requires:
- No network requests beyond localhost (Metro bundler)
- No file reads outside the project directory and `reportDir`
- No credential, token, or user data storage
- No telemetry or phone-home behavior

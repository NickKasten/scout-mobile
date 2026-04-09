# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| latest (main) | ✅ |
| older releases | ❌ — please upgrade |

Scout is pre-1.0 and under active development. Security fixes are applied to the latest release only. If you are running an older version, upgrade before reporting.

---

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Public issues expose the vulnerability to everyone before a fix is available. Instead, use one of the following:

- **GitHub private vulnerability reporting** — go to the Security tab of this repo and select "Report a vulnerability." This is the preferred channel.
- **Email** — nick@[yourdomain] (replace with your actual contact)

### What to include

A useful report includes:
- A description of the vulnerability and what it affects
- Steps to reproduce, or a minimal proof of concept
- The potential impact (what an attacker could do)
- Any suggested mitigations you have in mind

You do not need a complete exploit. A clear description of the issue is enough to get started.

---

## What Happens After You Report

1. You will receive an acknowledgment within **48 hours**
2. We will investigate and confirm the issue within **7 days**
3. A fix will be developed and tested
4. A patched release will be published
5. A public disclosure will be made after the fix is available — you will be credited unless you request otherwise

---

## Security Design Notes

Scout is an MCP server that shells out to `xcrun simctl` and `idb` on macOS. The following mitigations are built into the codebase:

- **Command injection prevention** — all shell commands use `execFileSync` with an args array, never string interpolation. User-supplied values (bundle IDs, device names, paths) are validated against allowlists before use.
- **Text input validation** — `simulator_type_text` validates input against a printable-ASCII allowlist (plus tab/newline). Control characters and null bytes are rejected before being passed to `idb ui text`.
- **Key event allowlist** — `simulator_press_key` uses a strict set of allowed key names (return, tab, escape, arrow keys, etc.). No raw keycodes are accepted.
- **Path traversal prevention** — all file paths are resolved and checked to be within their expected directory before any read or write.
- **No network egress** — Scout makes no outbound network requests beyond localhost (Metro bundler on a configurable port). It does not phone home or collect telemetry.
- **No credential storage** — Scout does not store, transmit, or log any credentials, tokens, or user-identifying data.
- **Minimal dependencies** — runtime dependencies are kept to the absolute minimum. Each dependency is explicitly justified. `npm audit` runs in CI on every pull request.

---

## Scope

The following are in scope for security reports:

- Command injection via user-supplied config values
- Text input validation bypass (e.g. injecting control characters via `simulator_type_text`)
- Key name allowlist bypass (e.g. passing arbitrary keycodes via `simulator_press_key`)
- Accessibility tree output injection (malformed idb JSON causing unexpected behavior)
- Path traversal in report or flow file handling
- MCP tool input validation bypasses
- Dependency vulnerabilities in published packages
- Any behavior that allows reading or writing files outside the project directory

The following are out of scope:

- Vulnerabilities in `xcrun simctl`, `idb`, or Metro bundler themselves (report those upstream)
- Social engineering attacks
- Issues that require physical access to the machine

---

## Thank You

Responsible disclosure makes open source software safer for everyone. We appreciate you taking the time to report issues privately.

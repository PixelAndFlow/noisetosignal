# Security Policy

## Reporting a vulnerability

If you find a security vulnerability in NoiseToSignal, please report it
privately rather than opening a public issue.

Use GitHub's **[private vulnerability reporting](https://github.com/PixelAndFlow/noisetosignal/security/advisories/new)**
for this repository (Security tab → "Report a vulnerability"). This
opens a private advisory visible only to the maintainers and you,
until a fix is ready and it's disclosed responsibly.

Please include, where possible:
- A description of the vulnerability and its potential impact
- Steps to reproduce it
- Any relevant logs, screenshots, or proof-of-concept code

## Supported versions

NoiseToSignal is a single, continuously-deployed application — there
are no maintained older versions. Reports are evaluated against the
current `main` branch.

## Scope

In scope:
- The application code in this repository (`server/`, `client/`)
- Authentication, session handling, and OAuth token storage
- API endpoints and data access controls

Out of scope:
- Vulnerabilities in third-party dependencies with a public CVE
  already tracked by [Dependabot](https://github.com/PixelAndFlow/noisetosignal/security/dependabot)
  — those are already visible and tracked; no need to separately
  report them here
- YouTube's own platform, API, or embedding behavior — not something
  this project controls

## What to expect

This is a small, actively-developed project without a formal SLA.
Reports are reviewed and acknowledged as promptly as possible, and
credited in the fix (if desired) once resolved.

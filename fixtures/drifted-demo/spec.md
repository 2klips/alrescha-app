# Drifted Demo Specification

## Authentication

- [ ] REQ-AUTH-001: The app MUST implement GitHub OAuth login through `loginWithGitHub`.
- [x] REQ-AUTH-002: The app MUST expire sessions after 30 minutes.
- [x] REQ-AUTH-003: The app MUST record an audit event after every successful login.

## Product claims

The service supports automatic password reset for every account.

## Retired integration

`src/legacy-billing.ts#legacyCharge` implements subscription billing.


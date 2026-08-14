# ADR-001 — Session timeout

## Status

Accepted

## Decision

Sessions expire when 30 minutes have elapsed since `lastActivityAt`. The implementation is `src/session.ts#isSessionExpired`.

## Consequences

The boundary at exactly 30 minutes counts as expired and requires an executable test.


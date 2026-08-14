export interface Session {
  readonly lastActivityAt: number;
}

export const SESSION_TIMEOUT_MS = 30 * 60 * 1_000;

export function isSessionExpired(session: Session, now: number): boolean {
  return now - session.lastActivityAt >= SESSION_TIMEOUT_MS;
}


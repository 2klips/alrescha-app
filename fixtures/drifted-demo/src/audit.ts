export interface AuditEvent {
  readonly event_name: "login_succeeded";
  readonly user_id: string;
}

export type AuditSink = (event: AuditEvent) => Promise<void>;

export async function recordSuccessfulLogin(userId: string, sink: AuditSink): Promise<void> {
  await sink({ event_name: "login_succeeded", user_id: userId });
}


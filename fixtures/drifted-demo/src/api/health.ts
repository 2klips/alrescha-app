export interface HealthResponse {
  readonly serviceName: "drifted-demo";
  readonly status: "ok";
}

export function getHealth(): HealthResponse {
  return { serviceName: "drifted-demo", status: "ok" };
}

/**
 * CLI copy (Korean-first, ADR-009-3 tone). ADR-013 §5: the local path is a
 * bridge, not a replacement — output always points at connecting GitHub.
 */

export const CLI_MESSAGES = {
  /** `스캔 중 · <dir>` */
  scanning: (directory: string) => `스캔 중 · ${directory}`,
  metadataOnly:
    "원본 코드는 전송되지 않습니다 — 메타데이터·digest·스팬만 업로드됩니다.",
  /** 업로드 요약 한 줄 */
  uploaded: (input: {
    artifactCount: number;
    removedCount: number;
    skippedCount: number;
  }) =>
    `업로드 완료 · 아티팩트 ${input.artifactCount}개 · 건너뜀 ${input.skippedCount}개 · 제거 ${input.removedCount}개`,
  unchanged: "변경 없음 — 마지막 업로드와 같은 상태입니다.",
  /**
   * ADR-015 §7: 이 경로가 무엇을 만들지 **못하는지**를 먼저 말한다. 본문이
   * 서버에 없으므로 Findings·Receipt는 산출될 수 없고, 없는 근거로 증명서를
   * 찍지 않는다.
   */
  graphOnly:
    "그래프 전용 인제스트 — 그래프·심볼·TODO는 갱신되지만 Findings·Receipt는 발급되지 않습니다(서버에 본문이 없어 분석할 수 없습니다).",
  githubNudge:
    "이 프로젝트를 GitHub에 연결하면 push마다 자동으로 분석되고 Findings·Receipt까지 발급됩니다. 온보딩: /onboarding",
  authFailed:
    "인증 실패 — 워크스페이스 설정(MCP)에서 발급한 토큰을 --token 또는 ALRESCHA_TOKEN으로 전달하세요.",
  offline: (detail: string) =>
    `서버에 연결할 수 없습니다 (${detail}). 아무것도 전송되지 않았습니다 — 네트워크 확인 후 다시 시도하세요.`,
  serverError: (httpStatus: number, detail: string) =>
    `서버 오류 ${httpStatus} — ${detail}`,
  invalidPayload: (detail: string) =>
    `페이로드 검증 실패(메타데이터 전용 계약 위반) — ${detail}`,
  missingToken:
    "토큰이 없습니다. --token <값> 또는 환경변수 ALRESCHA_TOKEN을 설정하세요.",
  missingServer:
    "서버 주소가 없습니다. --server <url> 또는 환경변수 ALRESCHA_SERVER_URL을 설정하세요.",
  usage:
    "사용법: alrescha push [디렉터리] --repo <owner/name> --server <url> --token <토큰>",
} as const;

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
    linkScope?: string;
    removedCount: number;
    skippedCount: number;
  }) =>
    `업로드 완료 · 아티팩트 ${input.artifactCount}개 · 건너뜀 ${input.skippedCount}개 · 제거 ${input.removedCount}개${
      input.linkScope === "full" ? " · 링크 전체 재계산" : ""
    }`,
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
    "사용법: alrescha push [디렉터리] --repo <owner/name> --server <url> --token <토큰> [--full]\n  --full: 변경되지 않은 파일까지 다시 읽어 링크를 전부 재계산합니다(업로드 내용은 동일하게 메타데이터뿐입니다).\n\n사용법: alrescha serve --local [디렉터리] [--repo <owner/name>]\n  로컬 저장소를 스캔해 stdio MCP로 제공합니다. 서버·토큰·네트워크가 필요 없습니다.",

  /**
   * `serve` 안내는 전부 stderr로 나간다 — stdout은 프로토콜 채널이다.
   */
  serving: (directory: string) => `로컬 서빙 · ${directory}`,
  /** ADR-013 §5·하드룰 ③: 이 경로에서는 본문이 머신을 떠나지 않는다. */
  servingLocalOnly:
    "이 경로는 아무것도 전송하지 않습니다 — 서버·토큰 없이 이 머신 안에서만 읽습니다.",
  servingReady: (input: {
    artifactCount: number;
    edgeCount: number;
    skippedCount: number;
  }) =>
    `준비됨 · 파일 ${input.artifactCount}개 · 관계 ${input.edgeCount}개 · 건너뜀 ${input.skippedCount}개`,
  /**
   * 세션이 끝나면 저장소도 사라지므로 쓰기 도구는 권한을 거절한다. 조용히
   * 무시하는 대신 무엇이 없는지 먼저 말한다.
   */
  servingReadOnly:
    "읽기 전용 — 진행 기록·메모·단언은 이 세션이 끝나면 남지 않으므로 쓰기 도구는 거절됩니다.",
  servingGraphOnly:
    "그래프 전용 — Findings·Receipt·요약은 없습니다(분석·요약은 서버 잡이며, 이 경로는 실행하지 않습니다).",
  servingMissingLocal:
    "serve는 --local 이 필요합니다. 원격 서빙 모드는 없습니다.",
} as const;

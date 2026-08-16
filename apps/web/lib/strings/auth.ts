/**
 * Copy for the auth surfaces (Phase 2A todo 8 — Korean-first sweep).
 */

export const AUTH = {
  login: {
    eyebrow: "보안 workspace 접근",
    title: "로그인.",
    body: "GitHub OAuth로 인증합니다. 연결한 레포와 증거는 개인 workspace에 격리됩니다.",
  },

  signIn: {
    pending: "GitHub 연결 중…",
    idle: "GitHub으로 시작",
    error: "GitHub 로그인을 시작하지 못했습니다.",
  },

  codeError: {
    eyebrow: "인증 실패",
    title: "로그인 실패.",
    body: "OAuth 응답을 검증하지 못했습니다. 다시 시도하세요.",
    back: "로그인으로 돌아가기",
  },
} as const;

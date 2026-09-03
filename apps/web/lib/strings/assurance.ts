/**
 * Copy for the assurance surfaces: Findings, AI 지시문 검사, Receipts
 * (WORK_SPEC §5.2-②/③/⑤). Phase 2A todo 3.
 */

export const ASSURANCE = {
  header: {
    /** `<repo> · <state>` */
    repoLine: "2klips/alrescha-app · bad0551",
    commitChip: "main · 스캔 완료",
  },

  findings: {
    kicker: "보증 대기열",
    title: "Findings",
    /** `미해소 <visible>/<total> · provenance 필수` */
    summary: (visible: number, total: number) =>
      `미해소 ${visible}/${total} · provenance 필수`,
    typeLabel: "발견 유형",
    severityLabel: "심각도",
    types: {
      all: "전체 유형",
      "missing-test": "테스트 누락",
      "contradicting-instructions": "지시문 모순",
      "stale-doc": "오래된 문서",
      "orphan-doc": "고아 문서",
    },
    severities: {
      all: "전체 심각도",
      critical: "critical",
      high: "high",
      medium: "medium",
      low: "low",
    },
    /** `<kind> · confidence <n>%` */
    rowMeta: (kind: string, confidence: number) =>
      `${kind} · confidence ${confidence}%`,
    emptyList: "두 필터를 모두 만족하는 발견이 없습니다.",
    /** `심각도 <level>` */
    severityLabelText: (severity: string) => `심각도 ${severity}`,
    meta: {
      rule: "규칙",
      confidence: "confidence",
      status: "상태",
      statusOpen: "open",
    },
    sourceSpan: {
      ariaLabel: "원문 스팬",
      title: "원문 스팬",
      loading: "commit 원문을 가져오는 중…",
      failed: "원문을 가져오지 못했습니다. 스팬 메타데이터는 보존됩니다.",
    },
    chain: { kicker: "증명 경로", title: "증거 체인" },
    action: { label: "권장 다음 행동", link: "연결된 Receipt 보기" },
  },

  lint: {
    kicker: "상시 로드 컨텍스트",
    title: "AI 지시문 검사",
    lead: "턴당 비용·중복·모순을 봅니다. 후보는 검토 전까지 ",
    leadTail: " 상태로 남습니다.",
    summary: {
      perTurn: "턴당 합계",
      alwaysLoaded: "상시 로드",
      overlap: "중복",
      contradictions: "모순 후보",
      /** `<n> tokens` */
      tokens: (count: string) => `${count} tokens`,
      /** `파일 <n>개` */
      files: (count: number) => `파일 ${count}개`,
    },
    cost: {
      kicker: "비용 인벤토리",
      title: "상시 로드 token 비용",
      ariaTable: "상시 로드 token 비용",
      columns: {
        file: "파일",
        loadedBy: "로드 주체",
        findings: "연결된 Findings",
        tokens: "턴당 tokens",
      },
    },
    overlap: {
      kicker: "중복",
      title: "중복 후보",
      note: "완전 일치와 정규화 문장 일치. token 추정은 같은 가정을 씁니다.",
    },
    contradiction: { kicker: "양측 근거 검토", title: "모순 후보" },
  },

  receipts: {
    kicker: "commit 연결 체인",
    title: "Receipts",
    /** `Statement <n>건 · 서명은 Phase 2로 연기` */
    summary: (count: number) => `Statement ${count}건 · 서명은 Phase 2로 연기`,
    current: "최신",
    stale: "stale",
    staleBanner: "stale: 이 Receipt는 현재 commit bad0551보다 이전입니다.",
    statementKicker: "in-toto Statement v1",
    fields: {
      statementType: "Statement 유형",
      predicateType: "Predicate 유형",
      subject: "대상",
      commit: "commit",
      run: "실행",
      previous: "이전 Receipt",
      chainRoot: "체인 시작점",
    },
    digest: { expected: "기대 Receipt digest", computed: "계산된 digest" },
    verification: {
      verified: "digest 검증됨",
      tampered: "변조 감지됨",
      invalid: "잘못된 Statement",
      verifying: "SHA-256 검증 중",
      pending: "미검증",
    },
    verdict: {
      label: "검증된 Receipt 판정",
      /** `verified <n> · inferred <m>` */
      counts: (verified: number, inferred: number) =>
        `verified ${verified} · inferred ${inferred}`,
      locked: "digest 검증에 성공해야 판정이 열립니다.",
    },
    verifyAction: "Receipt digest 검증",

    /**
     * /app/receipts — the workspace's own receipts, read from stored rows and
     * verified on the server against the stored digest (OQ-022 ⑴ made every
     * production receipt readable again, including the pre-rename issuer).
     */
    live: {
      kicker: "이 워크스페이스의 commit 연결 체인",
      title: "Receipts",
      /** `Statement <n>건 · 저장된 digest로 서버가 검증` */
      summary: (count: number) =>
        `Statement ${count}건 · 저장된 digest로 서버가 검증`,
      empty: {
        title: "발급된 Receipt 없음",
        body: "레포를 연결하고 push하면 첫 분석이 Receipt를 발급합니다.",
      },
      /** `stale: 이 Receipt는 현재 commit <sha7>보다 이전입니다.` */
      staleBanner: (sha7: string) =>
        `stale: 이 Receipt는 현재 commit ${sha7}보다 이전입니다.`,
      fields: {
        repository: "레포",
        issuedAt: "발급 시각",
        issuer: "발급 도구",
        coverage: "커버리지",
        findings: "발견 델타",
      },
      /** Shown next to a receipt whose statement names the pre-rename tool. */
      legacyIssuer: "리네임 이전 발급",
      /** `요구사항 <r> · 구현 verified <i> · 테스트 verified <t>` */
      coverage: (requirements: number, impl: number, test: number) =>
        `요구사항 ${requirements} · 구현 verified ${impl} · 테스트 verified ${test}`,
      /** `+<opened> / -<resolved> · 열린 Findings <n>건` */
      findingsDelta: (opened: number, resolved: number, openTotal: number) =>
        `+${opened} / -${resolved} · 열린 Findings ${openTotal}건`,
      findingsMissing: "스냅샷 없음",
      digestMissing: "저장된 digest 없음",
      computedNote: "페이지를 렌더할 때 서버가 Statement를 다시 계산한 digest입니다.",
      commitAction: "commit 카드 보기",
      unreadable: "저장된 Statement가 스키마와 맞지 않아 필드를 표시하지 않습니다.",
    },
  },
} as const;

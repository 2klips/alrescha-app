/**
 * Copy for the settings surfaces (Phase 2A todo 8 — Korean-first sweep).
 * Covers `/app/settings/ai`, `/app/settings/mcp`, `/app/settings/privacy`, and
 * `/app/connect/github` (+ repository picker). Tone matches `dashboard.ts`:
 * 제품 카피는 간결한 평서형, 버튼은 명사형.
 */

export const SETTINGS = {
  ai: {
    eyebrow: "판단 · inferred 전용",
    title: "판단 사용량",
    /** 개인정보 링크 앞부분 */
    introPrefix:
      "판단은 모호한 드리프트 후보를 확인합니다. 플랫폼 credits로 실행해 성공하면 credits가 차감되고, 실패하거나 스키마가 유효하지 않으면 환불됩니다. BYOK를 쓰면 credits를 쓰지 않습니다. 판단은 공급자를 직접 선택한 뒤에만 실행되며, inferred 결과와 근거, 작업 상태, 사용 내역은 workspace를 삭제할 때까지 남습니다. 원본 소스와 평문 키는 저장되지 않습니다. 자세한 내용은 ",
    /** 개인정보 링크 뒷부분 */
    introSuffix: "에서 확인하세요.",

    creditUsage: {
      heading: "credits 사용 현황",
      /** `credits <n>개` */
      balance: (count: number) => `credits ${count}개`,
      /** `<n>개 사용` */
      used: (count: number) => `${count}개 사용`,
      /** `<createdAt 앞 16자, T→공백> UTC` */
      timestamp: (isoDate: string) =>
        `${isoDate.slice(0, 16).replace("T", " ")} UTC`,
      pausedTitle: "판단 일시 중지",
      pausedBody: "credits를 추가하거나 BYOK를 설정한 뒤 다시 시도하세요.",
      pausedNote: "결정론적 스캔과 드리프트 분석은 계속 동작합니다.",
    },

    byok: {
      heading: "BYOK 등록",
      intro:
        "BYOK 판단은 credits를 쓰지 않습니다. 키는 저장 시 암호화되며 화면에 표시되거나 기록되지 않습니다.",
      providerFieldLabel: "공급자",
      apiKeyFieldLabel: "공급자 API 키",
      submit: "암호화 후 저장",
      providerNames: {
        anthropic: "Anthropic",
        openai: "OpenAI",
      },
      /** `<provider> BYOK 설정 완료` */
      configured: (provider: string) => `${provider} BYOK 설정 완료`,
      notConfigured: "설정되지 않음",
    },
  },

  mcp: {
    eyebrow: "호스팅형 MCP · 2026-07-28",
    title: "MCP 접근",
    /** `/api/mcp` 코드 조각 앞부분 */
    introPrefix: "범위가 제한된 인증 token으로 코딩 에이전트를 ",
    /** `<code>` 로 표시하는 엔드포인트 경로 */
    apiPath: "/api/mcp",
    /** `/api/mcp` 코드 조각 뒷부분 */
    introSuffix:
      "에 연결합니다. 작업별 컨텍스트를 필요할 때 구성합니다. 레포 변경은 검토를 거친 권고용 PR로만 제한되며, 세션, 샘플링, 루트, 로깅 기능은 제공하지 않습니다.",

    /** 에이전트별 지시 블록 설치기 (Phase 3 Wave D todo 11). */
    instructions: {
      eyebrow: "에이전트 설정 · 붙여넣기 한 번",
      title: "지시 블록 설치",
      lead: "에이전트의 지시 파일에 이 블록을 붙여넣으면 파일 전체 검색보다 Graph 툴을 먼저 씁니다. 아래 MCP 연결 설정과 함께 사용하세요.",
      targets: {
        claude: "Claude Code",
        codex: "Codex",
        cursor: "Cursor",
        generic: "범용 에이전트",
      },
      /** `대상 파일: <path>` */
      filePrefix: "대상 파일: ",
      copy: "블록 복사",
      copied: "복사됨",
      configTitle: "MCP 연결 설정",
      configLead:
        "발급한 token으로 설정 안의 자리 표시자를 바꾸고 에이전트의 MCP 설정에 추가하세요.",
      copyConfig: "설정 복사",
    },

    contextPack: {
      eyebrow: "Graph 선택 · 필요할 때 로드",
      title: "컨텍스트 팩 구성",
      taskLabel: "작업",
      taskPlaceholder:
        "GitHub OAuth 로그인을 구현하고 REQ-AUTH-001을 증명하세요",
      targetAgentLabel: "대상 에이전트",
      agents: {
        codex: "Codex",
        claudeCode: "Claude Code",
        cursor: "Cursor",
        generic: "범용 에이전트",
      },
      tokenBudgetLabel: "token 예산",
      composing: "구성 중…",
      compose: "컨텍스트 팩 구성",
      /** `추정 token <n>개` */
      estimatedTokens: (count: number) => `추정 token ${count}개`,
      readingOrderTitle: "읽기 순서",
      /** `순위별 제외 항목 <n>개` */
      omissions: (count: number) => `순위별 제외 항목 ${count}개`,
      formattedPack: "형식화된 팩",
    },

    minimalIndex: {
      eyebrow: "권고용 · 직접 commit 없음",
      title: "최소 에이전트 인덱스",
      agentsFile: "AGENTS.md",
      claudeFile: "CLAUDE.md",
      /** AGENTS.md와 CLAUDE.md 코드 조각을 감싸는 본문 */
      bodyMid: " 안에 범위가 제한된 관리 구역을 제안하고, 없을 때는 한 줄짜리 ",
      bodySuffix:
        " 래퍼도 함께 제안합니다. 레포 문서 본문은 포함하지 않습니다.",
      preparing: "diff 준비 중…",
      create: "권고용 PR 생성",
      upToDate: "관리 인덱스가 이미 최신 상태입니다.",
      proposalOpenedPrefix: "제안이 열렸습니다: ",
      viewPr: "PR 보기",
      /** `<권한> 필요` */
      permissionRequired: (permission: string) => `${permission} 필요`,
      permissionPausedBody:
        "자동 제안이 일시 중지되었습니다. 아래 diff를 확인하고, 선택 권한을 부여하거나, 관리 파일을 직접 복사하세요.",
      prWritePermission: "pull_requests:write",
      grantPrPermission: "PR 권한 부여",
      diffOnlyProposalTitle: "diff 전용 제안",
      current: "현재",
      proposed: "제안됨",
      newFilePlaceholder: "(새 파일)",
      copyManually: "파일 직접 복사",
      copyManuallyBody:
        "위에 표시된 제안 바이트만 복사하세요. 관리 마커 밖의 기존 바이트는 변경되지 않습니다.",
    },

    tokens: {
      never: "없음",
      /** `<n>` UTC */
      withUtc: (value: string) => `${value} UTC`,
      issueTitle: "접근 token 발급",
      nameLabel: "token 이름",
      namePlaceholder: "로컬 코딩 에이전트",
      scopesLegend: "권한 범위",
      scopeReadLabel: "컨텍스트와 Findings 조회",
      scopeWriteLabel: "진행 상황과 메모 기록",
      issuing: "발급 중…",
      issue: "token 발급",
      secretNotice: "지금 복사하세요. 이 token은 한 번만 표시됩니다.",
      listTitle: "접근 token 목록",
      empty: "발급된 token이 없습니다.",
      /** `마지막 사용: <값>` */
      lastUsed: (value: string) => `마지막 사용: ${value}`,
      revoked: "취소됨",
      revoke: "취소",
    },
  },

  privacy: {
    eyebrow: "보안 · 개인정보 · 보관",
    title: "개인정보 및 데이터 경계",
    linkLabel: "개인정보 및 데이터 경계",
    ariaLabel: "개인정보 및 데이터 경계",
    intro:
      "파일럿 workspace의 정확한 권한, 데이터 보존, 비밀 정보 처리, 보관 정책, credits 동작 방식을 설명합니다.",

    stored: {
      eyebrow: "저장됨",
      title: "메타데이터 전용 저장",
      body: "Arr는 레포 식별 정보, 파일 경로, 콘텐츠 digest, 소스 span, 추출된 요구사항, 증거 엣지, Findings, 테스트 리포트, Receipts, 작업 상태, 최소한의 감사 이벤트를 저장합니다.",
    },
    transient: {
      eyebrow: "저장되지 않음",
      title: "일시적 소스 접근",
      body: "원본 레포 파일과 GitHub 설치 token은 스캔을 위해 일시적으로 가져오며 저장하지 않습니다. GitHub App 연결을 해제하면 스캔은 멈추고, 저장된 증거는 읽기 전용으로 남습니다.",
    },
    secrets: {
      eyebrow: "비밀 정보",
      title: "BYOK 키 처리",
      /** `BYOK_ENCRYPTION_KEY` 코드 조각 앞부분 */
      bodyPrefix: "BYOK 공급자 키는 ",
      envVarName: "BYOK_ENCRYPTION_KEY",
      /** `BYOK_ENCRYPTION_KEY` 코드 조각 뒷부분 */
      bodySuffix:
        "로 별도 암호화되며, 저장 후에는 다시 반환되지 않고, 작업 페이로드, 프롬프트, 감사 메타데이터, 로그 어디에도 기록되지 않습니다.",
    },
    retention: {
      eyebrow: "보관",
      title: "접근 이벤트 30일 보관",
      body: "파일럿 workspace는 MCP 접근 이벤트를 30일 동안 보관합니다. 보안 감사 이벤트와 증거는 workspace를 삭제할 때까지 남습니다. 배포 작업이 매일 만료된 접근 이벤트를 정리합니다.",
    },
    credits: {
      eyebrow: "credits",
      title: "명시적 판단 사용만",
      body: "결정론적 스캔은 credits를 전혀 쓰지 않습니다. 판단은 사용자가 플랫폼 credits 사용을 선택하거나 BYOK를 설정한 뒤에만 실행됩니다. GitHub 접근이 취소된 뒤에는 credits를 쓰지 않습니다.",
    },
    claims: {
      eyebrow: "효과 주장",
      title: "내 측정값, 근거와 연결",
      bodyPrefix:
        "제품 효과는 충분히 모인 옵트인 workspace 데이터로만 표시됩니다. 출처를 확인하고 근거 JSON을 ",
      statsLinkLabel: "파일럿 Stats",
      bodySuffix: "에서 내보내세요.",
    },
  },

  connect: {
    github: {
      eyebrow: "GitHub App 연결",
      title: "레포를 연결하세요.",
      intro:
        "기본 연결은 읽기 전용입니다. GitHub App이 접근할 공개 또는 비공개 레포를 정확히 직접 선택합니다.",
      permissions: {
        contentsRead: {
          scope: "contents:read",
          description: "사양, 지침, 코드를 일시적으로 가져옵니다",
        },
        checksRead: {
          scope: "checks:read",
          description: "commit에 연결된 검증 결과를 수집합니다",
        },
        actionsRead: {
          scope: "actions:read",
          description: "선택한 테스트 리포트 아티팩트를 가져옵니다",
        },
        metadataRead: {
          scope: "metadata:read",
          description: "레포 정보와 기본 브랜치를 식별합니다",
        },
      },
      storageNote:
        "원본 소스와 설치 token은 저장되지 않습니다. Arr는 메타데이터, digest, span, Findings, Receipts를 저장합니다. 접근 이벤트는 파일럿 기간 동안 30일 보관됩니다.",
      install: "GitHub App 설치",
      urlConnect: {
        legend: "레포 주소로 바로 연결",
        description:
          "GitHub 레포 주소를 붙여넣으면 설치 여부를 확인해 바로 연결하거나 설치 화면으로 안내합니다.",
        label: "레포 주소",
        placeholder: "https://github.com/owner/repo 또는 owner/repo",
        submit: "주소로 연결",
        installCta: "이 레포로 GitHub App 설치",
        statuses: {
          invalidUrl:
            "레포 주소를 인식하지 못했습니다. https://github.com/owner/repo 형태인지 확인하세요.",
          alreadyConnected: (repository: string) =>
            `${repository}은(는) 이미 이 workspace에 연결되어 있습니다.`,
          noAccess: (repository: string) =>
            `GitHub App이 ${repository}에 접근할 수 없습니다. GitHub 설치 설정에서 이 레포를 추가한 뒤 다시 시도하세요.`,
          privateOrMissing: (repository: string) =>
            `${repository}을(를) 찾을 수 없습니다. 비공개 레포이거나 존재하지 않는 주소입니다. App을 설치하면서 직접 선택할 수 있습니다.`,
          install: (repository: string) =>
            `${repository}을(를) 연결하려면 GitHub App 설치가 필요합니다. 아래 버튼을 누르면 해당 레포가 선택된 설치 화면으로 이동합니다.`,
        },
      },
      prNotePrefix: "PR 제안 기능은 기본적으로 꺼져 있습니다. 활성화하면 ",
      prWritePermission: "pull_requests:write",
      prNoteMid: " 권한만 추가로 요청합니다. 전체 경계는 ",
      prNoteSuffix: "에서 확인하세요.",
    },
    repositories: {
      eyebrow: "레포 선택",
      title: "첫 레포를 선택하세요.",
      intro:
        "선택 후 일시적 설치 token은 이 레포로 범위가 제한되며 저장되지 않습니다. 비공개 소스는 스캔이 실행되는 동안만 가져오며, 메타데이터 전용 증거만 보관됩니다.",
      empty:
        "선택할 수 있는 레포가 없습니다. GitHub App을 다시 설치하거나 Onboarding의 시드 데모를 사용해 보세요.",
      suggested: "붙여넣은 주소의 레포입니다.",
    },
  },

  /**
   * Errors surfaced through the route error boundary. Developer-triggered,
   * but visible to a signed-in user, so they follow the Korean-first policy.
   */
  errors: {
    workspaceUnavailable: "개인 workspace를 사용할 수 없습니다.",
    creditUsageUnavailable: "credits 사용 내역을 불러올 수 없습니다.",
    byokConfigUnavailable: "BYOK 설정을 불러올 수 없습니다.",
  },
} as const;

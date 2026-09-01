/**
 * Copy for the onboarding surfaces (Phase 2A todo 8 — Korean-first sweep).
 * Tone: 제품 카피는 간결한 평서형, 버튼은 명사형.
 */

export const ONBOARDING = {
  ariaProgress: "온보딩 진행",
  brandTagline: "살아있는 지식그래프 워크스페이스",

  steps: {
    signIn: "로그인",
    installApp: "앱 설치",
    selectRepo: "레포 선택",
    firstScan: "첫 스캔",
  },

  identity: {
    kicker: "01 · 신원 확인",
    title: "레포지토리로 시작하세요.",
    body: "한 번만 로그인하세요. 공개 레포지토리도 Alrescha가 비공개 단독 워크스페이스를 만듭니다.",
    cta: "GitHub로 계속하기",
    demoCta: "샘플 데모로 시작",
    note: "설치 없이 시작. 레포지토리 쓰기 없음. Git 없이 시작하려면 로컬 인제스트 CLI(메타데이터만 업로드)도 있습니다.",
  },

  permission: {
    kicker: "02 · GitHub App",
    title: "읽기 전용. 증거 전용.",
    body: "GitHub에서 레포지토리를 선택하세요. 접근 권한은 선택한 범위로 제한됩니다. 소스 파일은 일시적으로만 가져오고, Alrescha는 메타데이터·digest·스팬·Findings·Receipts만 저장합니다.",
    error: {
      title: "설치에 `contents:read` 권한이 없습니다",
      body: "필요한 읽기 권한을 부여한 뒤 다시 시도하세요. 아무것도 가져오지 않았습니다.",
      action: "권한 확인",
    },
    scopes: {
      contents: {
        title: "콘텐츠 · 읽기",
        body: "명세, 지시문, 코드 메타데이터",
      },
      checks: { title: "검사 · 읽기", body: "commit에 연결된 테스트 판정" },
      actions: { title: "실행 · 읽기", body: "JUnit·Vitest 리포트 아티팩트" },
      metadata: {
        title: "메타데이터 · 읽기",
        body: "레포지토리 신원과 브랜치",
      },
    },
    cta: "GitHub App 설치",
    note: "접근 이벤트는 30일간 보관됩니다. `pull_requests:write`는 권고성 PR 제안 시에만 나중에 선택적으로 요청됩니다.",
  },

  repository: {
    kicker: "03 · 레포지토리",
    titleDemo: "알려진 드리프트 사례를 살펴보세요.",
    titleDefault: "첫 지식그래프가 될 레포를 선택하세요.",
    bodyDemo:
      "이 번들 공개 픽스처는 GitHub token, 비공개 레포지토리 권한, credit이 필요 없습니다.",
    bodyDefault: "설치 token은 일시적으로만 유지되며 저장되지 않습니다.",
    demoRepo: "alrescha/drifted-demo",
    defaultRepo: "2klips/alrescha-app",
    demoMeta: "fixtures/drifted-demo · 시드된 예상 Findings",
    defaultMeta: "TypeScript · main · 방금 업데이트",
    url: {
      legend: "레포 주소 붙여넣기",
      label: "GitHub 레포 주소",
      placeholder: "https://github.com/owner/repo",
      submit: "주소로 연결",
      invalid:
        "레포 주소를 인식하지 못했습니다. https://github.com/owner/repo 형태인지 확인하세요.",
      installNeeded: (repository: string) =>
        `${repository}에는 아직 GitHub App이 설치되어 있지 않습니다. 설치 화면에서 이 레포가 미리 선택됩니다.`,
      installCta: "이 레포로 App 설치",
    },
  },

  scan: {
    kicker: "04 · 첫 스캔",
    title: "지식그래프 구성 중",
    body: "아티팩트 15개 색인 · 요구사항 13개 · 메타데이터 전용 지식그래프",
    cta: "지식그래프 열기",
  },
} as const;

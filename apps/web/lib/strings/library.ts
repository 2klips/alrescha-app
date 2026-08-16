/**
 * Copy for the library surfaces (Phase 2A todo 8 — Korean-first sweep).
 * Tone: 제품 카피는 간결한 평서형, 버튼은 명사형.
 */

export const LIBRARY = {
  hero: {
    kicker: "워크스페이스 전체 · 불변 스냅샷",
    title: "개인 라이브러리",
    lead: "저장한 지시문은 레포지토리가 나중에 바뀌어도 정확한 소스 commit에 고정됩니다.",
    /** 좌측 패딩된 개수(`padStart(2, "0")`) 뒤에 붙는 접미사 — `저장 <count>개` */
    saved: (count: string) => `저장 ${count}개`,
  },

  filters: {
    aria: "라이브러리 필터",
    searchLabel: "스냅샷 검색",
    searchPlaceholder: "이름, 소스, 내용",
    tagAria: "태그로 필터",
    tags: "태그",
    all: "전체",
  },

  results: {
    ledger: "스냅샷 목록",
    allAssets: "저장된 자산 전체",
    /** `#<태그>` */
    tagHeading: (tag: string) => `#${tag}`,
    /** `결과 <n>개` */
    count: (total: number) => `결과 ${total}개`,
  },

  empty: {
    title: "일치하는 스냅샷이 없습니다",
    body: "필터를 지우거나 하네스에서 지시문을 저장하세요.",
    openHarness: "하네스 열기",
  },

  card: {
    /** `sha256: <digest>` */
    digestAria: (digest: string) => `sha256: ${digest}`,
    viewSnapshot: "불변 스냅샷 보기",
    deleteSnapshot: "스냅샷 삭제",
  },
} as const;

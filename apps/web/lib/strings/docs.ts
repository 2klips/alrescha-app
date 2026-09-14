/**
 * Copy for the doc pages (Phase 4 Wave D todo 20): a page is the readable
 * face of a node. The skeleton is derived and always present; the prose is
 * a model's and always `inferred`; a page without prose says so rather
 * than showing an empty column.
 */

export const DOCS = {
  kicker: "문서",
  title: "레포 문서 페이지",
  lead: "저장소·모듈·디렉터리마다 한 페이지 — 멤버·export 이름·관계·인용 후보는 스캔에서 유도되고, 산문은 AI가 쓰며 항상 inferred입니다.",
  ariaMain: "문서 페이지 목록",
  empty: {
    title: "아직 문서 페이지가 없습니다",
    body: "분석이 끝나면 스켈레톤 패스가 저장소·모듈·디렉터리 페이지를 만듭니다. 원문은 저장되지 않습니다 — 페이지는 이름과 개수만 담습니다.",
  },
  /** `<n>개 페이지` */
  count: (count: number) => `${count}개 페이지`,
  scopes: {
    concept: "개념",
    directory: "디렉터리",
    feature: "기능",
    file: "파일",
    module: "모듈",
    repo: "저장소",
  },
  /** `멤버 <n>개` */
  members: (count: number) => `멤버 ${count}개`,
  proseState: {
    /** No prose has been generated for this page. */
    missing: "산문 없음 — 아직 생성되지 않았습니다.",
    /** Prose exists but was generated from an older member set. */
    stale: "산문이 이전 멤버 구성 기준이라 현행으로 싣지 않습니다.",
  },
  page: {
    kicker: "문서 페이지",
    back: "문서 목록으로",
    sourceCommit: "기준 commit",
    sections: {
      summary: "설명",
      members: "멤버",
      symbols: "export 이름",
      relations: "관계",
      citations: "인용 가능한 노드",
      backlinks: "이 페이지를 인용한 페이지",
    },
    symbolsEmpty: "export 이름 없음",
    relationsEmpty: "관계 없음",
    citationsEmpty: "인용 후보 없음 — 멤버 밖으로 나가는 엣지가 없습니다.",
    backlinksEmpty: "인용한 페이지 없음",
    /** `<relation> <n>` */
    relationCount: (relation: string, count: number) => `${relation} ${count}`,
    /** `이전 주소 <n>개` */
    previousSlugs: (count: number) => `이전 주소 ${count}개`,
    notFound: "그 문서 페이지를 찾을 수 없습니다.",
  },
} as const;

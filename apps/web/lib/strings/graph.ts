/**
 * Copy for the graph surfaces (Phase 2A todo 8 — Korean-first sweep).
 * Tone: 제품 카피는 간결한 평서형, 버튼은 명사형.
 */

export const GRAPH = {
  back: "프로젝트 Graph로 돌아가기",
  heading: "증거 이웃",
  /** `깊이 2 · <n>개 노드` */
  depthLabel: (count: number) => `깊이 2 · ${count}개 노드`,
  commitChip: "bad0551",
  regionLabel: "2단계 증거 세부 Graph",

  canvas: {
    label: "로컬 Graph · 깊이 2 · 레이아웃 고정",
  },

  inspector: {
    kicker: "선택한 노드",
    fallbackTitle: "증거 엣지",
    orphanToggleLabel: "고아 아티팩트 표시",
    orphanToggleNote:
      "고아 아티팩트는 provenance 엣지가 없어 엣지 상세에 나타나지 않습니다.",
  },

  provenance: {
    kicker: "엣지 provenance",
    fallbackTitle: "증거 엣지를 선택하세요",
    span: "스팬",
    confidence: "신뢰도",
    grade: "증거 등급",
    relation: "관계",
    complete:
      "근거 계보가 완전합니다. 마우스 오버 상세는 근거 없는 엣지로 대체되지 않습니다.",
    empty: "이 근접 영역에 표시할 provenance가 없습니다.",
  },

  edgeIndex: {
    kicker: "표시된 증거 엣지",
  },

  footer: {
    relatedFindings: "관련 Findings",
    sourceRecord: "소스 레코드",
  },
} as const;

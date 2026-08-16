# Phase 2A · Task 3 — Korean-first copy snapshot

Generated from `apps/web/lib/strings/*` — every user-facing string on the converted screens.
Function-valued entries are rendered with placeholder arguments (1, 2).

### BRAND

| key | 카피 |
| --- | --- |
| `BRAND.name` | Arr |
| `BRAND.tagline` | Proof, before merge. |
| `BRAND.homeLabel` | Arr 홈 |

### NAV

| key | 카피 |
| --- | --- |
| `NAV.ariaPrimary` | 주요 내비게이션 |
| `NAV.ariaSurfaces` | 보증 화면 |
| `NAV.toggle` | 내비게이션 열기 |
| `NAV.graph` | Graph |
| `NAV.findings` | Findings |
| `NAV.lint` | 지시문 린트 |
| `NAV.progress` | 진행 |
| `NAV.receipts` | Receipts |
| `NAV.harness` | 하네스 자산 |
| `NAV.library` | 증거 라이브러리 |
| `NAV.connectRepo` | 레포 연결 |

### THEME

| key | 카피 |
| --- | --- |
| `THEME.dark` | Dark |
| `THEME.light` | Light |
| `THEME.switchSuffix` |  테마로 전환 |

### GRADE

| key | 카피 |
| --- | --- |
| `GRADE.verified` | verified |
| `GRADE.inferred` | inferred |
| `GRADE.broken` | broken |
| `GRADE.waiting` | 대기 |

### DASHBOARD

| key | 카피 |
| --- | --- |
| `DASHBOARD.ariaMain` | Arr 프로젝트 보증 Dashboard |
| `DASHBOARD.ariaRepoRail` | 레포 요약 |
| `DASHBOARD.ariaMetrics` | 보증 지표 |
| `DASHBOARD.ariaMetricsMobile` | 모바일 보증 지표 |
| `DASHBOARD.ariaLegend` | Graph 범례 |
| `DASHBOARD.ariaControls` | Graph 제어 |
| `DASHBOARD.ariaInspector` | 선택한 노드 |
| `DASHBOARD.repoKicker` | 레포 |
| `DASHBOARD.repoBranchLine` | main · bad0551 |
| `DASHBOARD.metricEvidenceKicker` | 지표 근거 |
| `DASHBOARD.metricEvidenceClose` | 근거 닫기 |
| `DASHBOARD.title` | 프로젝트 증명 맵 |
| `DASHBOARD.commitKicker` | 현재 commit |
| `DASHBOARD.metrics.unresolved` | 미해소 Findings |
| `DASHBOARD.metrics.implementation` | 구현 커버리지 |
| `DASHBOARD.metrics.tests` | 테스트 커버리지 |
| `DASHBOARD.metrics.tokens` | 상시 로드 |
| `DASHBOARD.legend.requirement` | 요구사항 |
| `DASHBOARD.legend.code` | 코드 |
| `DASHBOARD.legend.test` | verified 테스트 |
| `DASHBOARD.search.label` | Graph 검색 |
| `DASHBOARD.search.placeholder` | 증명 맵 검색 |
| `DASHBOARD.filters.typeLabel` | 노드 유형 |
| `DASHBOARD.filters.gradeLabel` | 증거 등급 |
| `DASHBOARD.filters.localFocus` | 로컬 포커스 |
| `DASHBOARD.filters.types.all` | 전체 노드 |
| `DASHBOARD.filters.types.requirement` | 요구사항 |
| `DASHBOARD.filters.types.document` | 문서 |
| `DASHBOARD.filters.types.code` | 코드 |
| `DASHBOARD.filters.types.test` | 테스트 |
| `DASHBOARD.filters.grades.all` | 전체 증거 |
| `DASHBOARD.filters.grades.verified` | verified |
| `DASHBOARD.filters.grades.inferred` | inferred |
| `DASHBOARD.filters.grades.broken` | broken |
| `DASHBOARD.ci.present` | CI 증거 · bad0551에서 테스트 78건 verified |
| `DASHBOARD.ci.missing` | 이 commit에는 CI 리포트가 없습니다 — 테스트 링크는 inferred로 남습니다. |
| `DASHBOARD.canvasTitle` | 요구사항·문서·코드·verified 테스트를 잇는 증거 Graph |
| `DASHBOARD.canvasLabel(…)` | 증거 Graph · 노드 1개 표시 |
| `DASHBOARD.clusterNote(…)` | 노드 1개를 유형·등급으로 묶었습니다 |
| `DASHBOARD.states.loading.title` | 증거 색인 불러오는 중 |
| `DASHBOARD.states.loading.body` | Graph의 스팬과 등급을 해석하고 있습니다. |
| `DASHBOARD.states.empty.title` | Graph 캔버스 준비됨 |
| `DASHBOARD.states.empty.body` | 첫 스캔이 문서 → 요구사항 → 코드 → 테스트를 여기에 이어 그립니다. |
| `DASHBOARD.states.scanning.title` | 증명 축 구성 중 · 62% |
| `DASHBOARD.states.scanning.body` | 아티팩트 15개 색인 완료 · 요구사항 추출 중 |
| `DASHBOARD.states.revoked.title` | GitHub App 연결 끊김 |
| `DASHBOARD.states.revoked.body` | 자동 스캔이 멈췄습니다. 저장된 증거는 읽기 전용으로 남고, 연결이 끊긴 동안 크레딧은 쓰이지 않습니다. |
| `DASHBOARD.states.revoked.reconnect` | GitHub App 재연결 |
| `DASHBOARD.states.revoked.viewStored` | 저장된 증거 보기 |
| `DASHBOARD.states.permissionError.title` | GitHub 권한 변경됨 |
| `DASHBOARD.states.permissionError.body` | contents:read 권한이 필요합니다. 레포 데이터는 저장되지 않았습니다. |
| `DASHBOARD.states.permissionError.action` | 권한 확인 |
| `DASHBOARD.states.failed.title` | 분석 전에 스캔이 멈췄습니다 |
| `DASHBOARD.states.failed.body` | 녹화된 GitHub 응답이 시간 초과됐습니다. 기존 증거는 그대로 볼 수 있습니다. |
| `DASHBOARD.states.failed.action` | 스캔 재시도 |
| `DASHBOARD.metricEvidence.unresolved[0]` | 미해소 Findings 4건 |
| `DASHBOARD.metricEvidence.unresolved[1]` | missing-test 2 · stale-doc 1 · unproven-claim 1 |
| `DASHBOARD.metricEvidence.unresolved[2]` | 출처: 최신 결정론 분석 |
| `DASHBOARD.metricEvidence.implementation[0]` | 구현 커버리지 84% |
| `DASHBOARD.metricEvidence.implementation[1]` | 활성 요구사항 13개 중 11개에 구현 증거가 있습니다 |
| `DASHBOARD.metricEvidence.implementation[2]` | 출처: 요구사항 → 코드 엣지 |
| `DASHBOARD.metricEvidence.tests[0]` | 테스트 커버리지 71% |
| `DASHBOARD.metricEvidence.tests[1]` | 파싱된 CI 리포트에서 verified 링크 10개 |
| `DASHBOARD.metricEvidence.tests[2]` | 출처: bad0551 GitHub Actions 리포트 |
| `DASHBOARD.metricEvidence.tokens[0]` | 턴당 1,840 tokens |
| `DASHBOARD.metricEvidence.tokens[1]` | AGENTS.md와 하위 지시문이 항상 로드됩니다 |
| `DASHBOARD.metricEvidence.tokens[2]` | 가정: cl100k_base 호환 추정치 |
| `DASHBOARD.inspector.kicker` | Inspector |
| `DASHBOARD.inspector.lead` | 이 주장을 요구사항에서 구현·테스트 증거까지 따라갑니다. |
| `DASHBOARD.inspector.chainTitle` | 증거 체인 |
| `DASHBOARD.inspector.findingCount(…)` | 미해소 Findings 1건 |
| `DASHBOARD.inspector.empty` | 노드를 선택하면 증명 체인을 볼 수 있습니다. |
| `DASHBOARD.activity.live` | Live |
| `DASHBOARD.activity.title` | 에이전트 활동 |
| `DASHBOARD.activity.replay` | MCP 세션 재생 |
| `DASHBOARD.activity.trace` | 실시간 추적 |
| `DASHBOARD.activity.samples[0].detail` | 파일 42개 색인 |
| `DASHBOARD.activity.samples[0].meta` | git: bad0551 |
| `DASHBOARD.activity.samples[0].time` | 10:24:31 |
| `DASHBOARD.activity.samples[0].tool` | search_index |
| `DASHBOARD.activity.samples[1].detail` | 테스트 결과 조회 (#8721) |
| `DASHBOARD.activity.samples[1].meta` | cache: hit |
| `DASHBOARD.activity.samples[1].time` | 10:24:28 |
| `DASHBOARD.activity.samples[1].tool` | get_artifact |
| `DASHBOARD.activity.samples[2].detail` | 제한된 컨텍스트 팩 구성 |
| `DASHBOARD.activity.samples[2].meta` | worker: 3 |
| `DASHBOARD.activity.samples[2].time` | 10:24:27 |
| `DASHBOARD.activity.samples[2].tool` | request_context_pack |

### ASSURANCE

| key | 카피 |
| --- | --- |
| `ASSURANCE.header.repoLine` | 2klips/specproof-app · bad0551 |
| `ASSURANCE.header.commitChip` | main · 스캔 완료 |
| `ASSURANCE.findings.kicker` | 보증 대기열 |
| `ASSURANCE.findings.title` | Findings |
| `ASSURANCE.findings.summary(…)` | 미해소 1/2 · provenance 필수 |
| `ASSURANCE.findings.typeLabel` | 발견 유형 |
| `ASSURANCE.findings.severityLabel` | 심각도 |
| `ASSURANCE.findings.types.all` | 전체 유형 |
| `ASSURANCE.findings.types.missing-test` | 테스트 누락 |
| `ASSURANCE.findings.types.contradicting-instructions` | 지시문 모순 |
| `ASSURANCE.findings.types.stale-doc` | 오래된 문서 |
| `ASSURANCE.findings.types.orphan-doc` | 고아 문서 |
| `ASSURANCE.findings.severities.all` | 전체 심각도 |
| `ASSURANCE.findings.severities.critical` | critical |
| `ASSURANCE.findings.severities.high` | high |
| `ASSURANCE.findings.severities.medium` | medium |
| `ASSURANCE.findings.severities.low` | low |
| `ASSURANCE.findings.rowMeta(…)` | 1 · confidence 2% |
| `ASSURANCE.findings.emptyList` | 두 필터를 모두 만족하는 발견이 없습니다. |
| `ASSURANCE.findings.severityLabelText(…)` | 심각도 1 |
| `ASSURANCE.findings.meta.rule` | 규칙 |
| `ASSURANCE.findings.meta.confidence` | confidence |
| `ASSURANCE.findings.meta.status` | 상태 |
| `ASSURANCE.findings.meta.statusOpen` | open |
| `ASSURANCE.findings.sourceSpan.ariaLabel` | 원문 스팬 |
| `ASSURANCE.findings.sourceSpan.title` | 원문 스팬 |
| `ASSURANCE.findings.sourceSpan.loading` | commit 원문을 가져오는 중… |
| `ASSURANCE.findings.sourceSpan.failed` | 원문을 가져오지 못했습니다. 스팬 메타데이터는 보존됩니다. |
| `ASSURANCE.findings.chain.kicker` | 증명 경로 |
| `ASSURANCE.findings.chain.title` | 증거 체인 |
| `ASSURANCE.findings.action.label` | 권장 다음 행동 |
| `ASSURANCE.findings.action.link` | 연결된 Receipt 보기 |
| `ASSURANCE.lint.kicker` | 상시 로드 컨텍스트 |
| `ASSURANCE.lint.title` | 지시문 린트 |
| `ASSURANCE.lint.lead` | 턴당 비용·중복·모순을 봅니다. 후보는 검토 전까지  |
| `ASSURANCE.lint.leadTail` |  상태로 남습니다. |
| `ASSURANCE.lint.summary.perTurn` | 턴당 합계 |
| `ASSURANCE.lint.summary.alwaysLoaded` | 상시 로드 |
| `ASSURANCE.lint.summary.overlap` | 중복 |
| `ASSURANCE.lint.summary.contradictions` | 모순 후보 |
| `ASSURANCE.lint.summary.tokens(…)` | 1 tokens |
| `ASSURANCE.lint.summary.files(…)` | 파일 1개 |
| `ASSURANCE.lint.cost.kicker` | 비용 인벤토리 |
| `ASSURANCE.lint.cost.title` | 상시 로드 token 비용 |
| `ASSURANCE.lint.cost.ariaTable` | 상시 로드 token 비용 |
| `ASSURANCE.lint.cost.columns.file` | 파일 |
| `ASSURANCE.lint.cost.columns.loadedBy` | 로드 주체 |
| `ASSURANCE.lint.cost.columns.findings` | 연결된 Findings |
| `ASSURANCE.lint.cost.columns.tokens` | 턴당 tokens |
| `ASSURANCE.lint.overlap.kicker` | 중복 |
| `ASSURANCE.lint.overlap.title` | 중복 후보 |
| `ASSURANCE.lint.overlap.note` | 완전 일치와 정규화 문장 일치. token 추정은 같은 가정을 씁니다. |
| `ASSURANCE.lint.contradiction.kicker` | 양측 근거 검토 |
| `ASSURANCE.lint.contradiction.title` | 모순 후보 |
| `ASSURANCE.receipts.kicker` | commit 연결 체인 |
| `ASSURANCE.receipts.title` | Receipts |
| `ASSURANCE.receipts.summary(…)` | Statement 1건 · 서명은 Phase 2로 연기 |
| `ASSURANCE.receipts.current` | 최신 |
| `ASSURANCE.receipts.stale` | stale |
| `ASSURANCE.receipts.staleBanner` | stale: 이 Receipt는 현재 commit bad0551보다 이전입니다. |
| `ASSURANCE.receipts.statementKicker` | in-toto Statement v1 |
| `ASSURANCE.receipts.fields.statementType` | Statement 유형 |
| `ASSURANCE.receipts.fields.predicateType` | Predicate 유형 |
| `ASSURANCE.receipts.fields.subject` | 대상 |
| `ASSURANCE.receipts.fields.commit` | commit |
| `ASSURANCE.receipts.fields.run` | 실행 |
| `ASSURANCE.receipts.fields.previous` | 이전 Receipt |
| `ASSURANCE.receipts.fields.chainRoot` | 체인 시작점 |
| `ASSURANCE.receipts.digest.expected` | 기대 Receipt digest |
| `ASSURANCE.receipts.digest.computed` | 계산된 digest |
| `ASSURANCE.receipts.verification.verified` | digest 검증됨 |
| `ASSURANCE.receipts.verification.tampered` | 변조 감지됨 |
| `ASSURANCE.receipts.verification.invalid` | 잘못된 Statement |
| `ASSURANCE.receipts.verification.verifying` | SHA-256 검증 중 |
| `ASSURANCE.receipts.verification.pending` | 미검증 |
| `ASSURANCE.receipts.verdict.label` | 검증된 Receipt 판정 |
| `ASSURANCE.receipts.verdict.counts(…)` | verified 1 · inferred 2 |
| `ASSURANCE.receipts.verdict.locked` | digest 검증에 성공해야 판정이 열립니다. |
| `ASSURANCE.receipts.verifyAction` | Receipt digest 검증 |

### PROGRESS

| key | 카피 |
| --- | --- |
| `PROGRESS.header.repoLine` | 2klips/specproof-app · 진행 원장 |
| `PROGRESS.header.commitChip` | main · 출처 있는 상태 |
| `PROGRESS.kicker` | 레포 진행 원장 |
| `PROGRESS.sourceContract` | 출처가 있는 항목만 |
| `PROGRESS.ariaMetrics` | 커버리지 지표 |
| `PROGRESS.ariaStateSwitcher` | 데모 진행 데이터 상태 |
| `PROGRESS.metrics.requirements` | 요구사항 커버리지 |
| `PROGRESS.metrics.todos` | todo 완료율 |
| `PROGRESS.metrics.notMeasured` | 측정 안 됨 |
| `PROGRESS.metrics.completed(…)` | 1 / 2 완료 |
| `PROGRESS.states.empty.label` | 기록된 진행 없음 |
| `PROGRESS.states.empty.description` | TODO·진행 문서를 스캔하거나 log_progress 이벤트를 한 번 보내세요. |
| `PROGRESS.states.partial.label` | 부분 증거 |
| `PROGRESS.states.partial.description` | 완료가 open 또는 blocked 상태입니다. 아래 수치는 저장된 출처에서만 옵니다. |
| `PROGRESS.states.full.label` | 전부 추적됨 |
| `PROGRESS.states.full.description` | 기록된 요구사항과 todo 모두 출처 있는 완료 증거를 가집니다. |
| `PROGRESS.todoBoard.kicker` | 현재 상태 |
| `PROGRESS.todoBoard.title` | Todo 보드 |
| `PROGRESS.todoBoard.empty` | 출처 있는 항목 없음 |
| `PROGRESS.todoBoard.itemsSuffix` | 건 출처 확인 |
| `PROGRESS.todoBoard.statuses.open` | open |
| `PROGRESS.todoBoard.statuses.in-progress` | 진행 중 |
| `PROGRESS.todoBoard.statuses.done` | 완료 |
| `PROGRESS.todoBoard.statuses.blocked` | blocked |
| `PROGRESS.timeline.kicker` | 최신순 |
| `PROGRESS.timeline.title` | 최근 작업 |
| `PROGRESS.timeline.eventCount(…)` | 이벤트 1건 |
| `PROGRESS.timeline.empty` | 진행 이벤트·commit·해소된 Findings가 없습니다. |

# ADR-001 — 통합 제품 포지셔닝

- 날짜: 2026-07-28
- 상태: 채택 (Accepted)
- 정본: `spec/DECISIONS-ADR.md#adr-001--통합-제품-포지셔닝`

## 맥락

SpecProof는 AI 개발 프로젝트의 기억, Skills, 하네스, 요구사항, 코드, 테스트 실행을 따로 관리하면 기획이 실제 결과로 증명됐는지 추적할 수 없다는 문제를 푼다.

## 결정

다음 기능을 유지한다.

- second brain
- knowledge/evidence graph
- Skill 저장·불러오기
- Skill 분석
- harness 분석

제품 중심 포지셔닝:

> 기획이 실제 코드와 테스트로 증명됐는지 자동 추적하는 AI 개발 보증 시스템.

통합 정의:

> AI 개발 프로젝트의 기억·Skills·하네스·요구사항·코드·테스트 실행을 하나의 증거 그래프로 연결해, 에이전트가 무엇을 알고 어떤 규칙으로 작업했으며 결과가 실제로 증명됐는지 추적한다.

기능 역할:

- second brain: 프로젝트 장기 기억
- graph: 기억·실행 자산·구현·증거의 공통 모델
- Skill registry: 반복 작업 자산의 저장·버전·배포
- Skill analyzer: 형식·공급망·권한·계약·실행 위험 분석
- harness analyzer: 실제 적용 instruction·Skill·MCP·hook·permission 계산
- assurance engine: requirement→code→test→receipt 판정

설계 원칙:

- Agent Skills, MCP, OKF v0.2 등 기존 표준을 consumer로 지원한다.
- AI 추론은 `inferred`, 실행 증거만 `verified`다.
- 모든 receipt는 commit·artifact·Skill·harness digest와 연결한다.
- local-first, Git-native를 원안으로 한다. 전달 형태는 ADR-003이 GitHub-우선 웹 SaaS로 개정한다.
- public Skill marketplace는 신뢰·분석·sandbox 이후다.

## 결과

- 핵심 도메인은 requirement→code→test→receipt 증거 그래프다.
- 모든 판정 표면은 `verified`와 `inferred`를 구분해야 한다.
- 영수증은 커밋과 아티팩트 digest에 결합해야 한다.
- spec 생성 도구나 agent를 복제하지 않고 현재 커밋의 증거를 독립 검증한다.
- 전달 방식 충돌 시 후속 ADR-003을 적용한다. 증거 모델과 검증 원칙은 그대로 유지한다.

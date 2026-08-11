# Open Questions

구현 중 발견한 스펙 모순·불명확 사항을 여기에 기록한다. (에이전트가 유일하게 수정할 수 있는 spec/ 문서)

형식:

```
## OQ-001 — <제목>
- 발견: <할일 번호 / 파일>
- 내용: <무엇이 모순/불명확한가, 관련 스펙 인용>
- 임시 결정: <어떤 기본값으로 진행했나 + 근거>
- 상태: open | resolved(<ADR/답변 참조>)
```

---

## OQ-001 — 최소 인덱스 PR에 필요한 GitHub Contents 쓰기 권한

- 발견: Task 16 / `spec/WORK_SPEC.md` §12, guardrail 9
- 내용: 사양은 `contents:read` + 선택적 `pull_requests:write`만 허용한다. GitHub REST의 PR 생성은 Pull requests(write)로 가능하지만, 제안 브랜치 생성과 `AGENTS.md`/`CLAUDE.md` 반영은 Contents(write)가 필요하다. Pull requests(write)만으로 새 diff를 만들 수 없다.
- 임시 결정: 권한을 확대하지 않는다. PR 제안 로직은 주입된 GitHub 경계로 완전 테스트하고, 실제 권한이 부족하면 diff 복사 및 권한 안내만 제공한다. 실제 GitHub 호출이 403이면 같은 안전한 fallback으로 전환한다. `contents:write` 승인 전에는 직접 쓰기 경로를 활성화하지 않는다.
- 근거: https://docs.github.com/en/rest/repos/contents 및 https://docs.github.com/en/rest/pulls/pulls
- 상태: open

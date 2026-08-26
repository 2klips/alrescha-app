-- OQ-010 / OQ-018 / WORK_SPEC §13 "Wave 4": the arr.tools domain was
-- purchased on 2026-08-26, so the receipt predicateType moved from the
-- unowned placeholder (https://arr.dev/receipt/v1) to the production value
-- (https://arr.tools/receipt/v1) and the statement gained its reserved
-- fields (git:commit subject, tool, analyzedAt, coverage). That change
-- breaks every stored digest by design — this is the one planned moment it
-- may happen. Receipts issued under the placeholder are development data
-- and are discarded, exactly as the spec reserved: "이 개정 전에 발급된
-- receipt(로컬 개발 데이터)는 폐기한다. 프로덕션 첫 receipt부터 최종
-- 포맷이어야 한다."
delete from public.receipts
where summary -> 'statement' ->> 'predicateType' = 'https://arr.dev/receipt/v1';

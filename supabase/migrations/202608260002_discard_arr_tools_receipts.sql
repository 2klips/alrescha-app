-- The production deployment uses Vercel's stable project domain instead of
-- purchasing another custom domain. No production receipt had been issued,
-- so receipts created locally with the superseded arr.tools predicate type
-- are discarded before the first production receipt is allowed.
delete from public.receipts
where summary -> 'statement' ->> 'predicateType' = 'https://arr.tools/receipt/v1';

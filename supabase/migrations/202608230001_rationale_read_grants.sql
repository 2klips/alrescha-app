-- Rationale read grants (Phase 3 Wave A todo 1).
--
-- 202608170003 created `rationales` with an owner select POLICY but no table
-- GRANT: the blanket grants in 202608100001/..0002 covered only the tables
-- that existed then, so `authenticated` had a policy it could never reach and
-- every direct select failed with "permission denied". Writes never noticed —
-- they go through `apply_repository_scan`, which is security definer. The
-- `/app/map` loader is the first direct reader, and its PGlite harness test
-- is what surfaced this (same class as the Wave 1 service_role gap).

grant select on public.rationales to authenticated;
grant all on public.rationales to service_role;

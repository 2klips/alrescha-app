begin;

-- The doc page slug carries the page's identity (Phase 4 todo 20, production
-- rollout 2026-09-15).
--
-- The 2026-09-06 rule addressed a module page by its member *directories*
-- alone, so two modules spanning the same directories hashed to one slug.
-- On the pilot repository that was `scripts/adr-guardrails.ts` and
-- `scripts/verify-plan-coverage.ts` (both over `scripts/` and `tests/`), and
-- the first `docskeleton` pass in production died on
-- `doc_pages_workspace_repository_slug_unique` — three attempts, every one of
-- them the same collision, zero pages written.
--
-- The identity key already tells the two apart (it is what
-- `doc_pages_workspace_repository_identity_unique` is over), so it now joins
-- the hash for the three node scopes. The directories stay in it: a module
-- that spans a new directory still gets a new address and keeps the old one
-- in `previous_slugs`, and a module that gains a file in a directory it
-- already spans keeps its address. Attached scopes are unchanged — their
-- identity was already the whole address.
--
-- `packages/core/src/docs/doc-page.ts` states the same rule and
-- `tests/doc-pages.test.ts` pins the two implementations against each other,
-- now including the two-modules-one-directory-set case.

create or replace function public.doc_page_slug(
  page_scope text,
  member_paths text[],
  identity_key text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(
    page_scope || E'\n' ||
    case
      when page_scope in ('feature', 'module', 'repo') then
        coalesce(identity_key, '') || E'\n' || coalesce(
          (
            select string_agg(directory, E'\n' order by directory collate "C")
            from (
              select distinct regexp_replace(path, '/?[^/]*$', '') as directory
              from unnest(coalesce(member_paths, array[]::text[])) as path
            ) directories
          ),
          ''
        )
      else coalesce(identity_key, '')
    end
  );
$$;

-- Re-address any page stored under the old rule, remembering its old
-- address so a link to it still answers. Production holds none (the pass
-- that would have written them is the one that failed); a local database
-- may. `slug` on the right-hand side is the old value.
update public.doc_pages
set previous_slugs = array(select distinct unnest(previous_slugs || slug)),
    slug = public.doc_page_slug(scope, member_paths, identity_key),
    updated_at = now()
where slug <> public.doc_page_slug(scope, member_paths, identity_key);

commit;

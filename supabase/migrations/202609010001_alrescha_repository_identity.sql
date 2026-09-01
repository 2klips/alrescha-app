-- Canonical implementation-repository identity after the GitHub rename.
-- Repository IDs and installation links remain stable; only the address changes.
update public.repositories
set full_name = '2klips/alrescha-app'
where full_name = '2klips/arr-app';

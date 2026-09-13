-- The browser may listen to its own workspace's access-event channel, and
-- to nothing else (Phase 4 Wave B todo 15, ADR-004 ③ "본인 워크스페이스만").
--
-- The hosted MCP server has broadcast one `access_event` per tool call on
-- `workspace:<id>:access-events` since Phase 2A — through the service role,
-- over REST, so the publish never needed a policy. Nobody subscribed: the
-- map screen listened to a `window` bus the demo page fed and the live
-- screen never did, which is D10. Subscribing needs authorization, because
-- a public Realtime topic is readable by anyone holding the publishable key
-- and a workspace id, and an access event names the nodes an agent just
-- read. The channel is therefore *private*, and a private channel is
-- readable exactly when this policy says so.
--
-- What the policy grants:
--
-- - `select` on `realtime.messages`, for `authenticated` — the join check
--   Realtime runs when a socket asks for a private topic;
-- - only for broadcast frames (`extension = 'broadcast'`);
-- - only when the topic is `workspace:<id>:access-events` and the caller is
--   an active member of `<id>` (`public.is_workspace_member`, the same
--   function every tenant table's read policy already uses).
--
-- What it does not grant: `insert`. The browser can listen but cannot
-- publish, so a signed-in user cannot light nodes in a workspace by sending
-- a frame that looks like a tool call. The server keeps publishing through
-- the service role, which bypasses RLS as it does for every other table.
--
-- Guarded: `realtime.messages` exists on Supabase and nowhere else. The
-- unit-test database is plain Postgres (PGlite) with no `realtime` schema,
-- and so is any developer database restored without the platform schemas.
-- On those the migration records itself and creates nothing, rather than
-- failing the ledger for a table the product does not own. The test that
-- covers the policy installs a stub of that table first.

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages is absent; the access-events channel policy is skipped';
    return;
  end if;

  execute $policy$
    create policy access_events_channel_member_read
      on realtime.messages
      for select
      to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and (select realtime.topic()) like 'workspace:%:access-events'
        and (
          select public.is_workspace_member(
            split_part((select realtime.topic()), ':', 2)
          )
        )
      )
  $policy$;
end;
$$;

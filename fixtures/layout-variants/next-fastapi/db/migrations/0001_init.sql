-- The database tier of the `frontend/ + backend/ + db/` shape.
create table sessions (
  id text primary key,
  user_id text not null,
  expires_at timestamptz not null
);

create index sessions_user_idx on sessions(user_id);

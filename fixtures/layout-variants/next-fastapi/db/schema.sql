-- Current shape of the tables the API reads.
create table users (
  id text primary key,
  email text not null unique
);

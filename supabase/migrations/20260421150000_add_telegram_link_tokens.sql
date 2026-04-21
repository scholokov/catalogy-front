create table if not exists telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  telegram_chat_id text,
  telegram_username text,
  telegram_first_name text,
  created_at timestamptz not null default now()
);

create index if not exists telegram_link_tokens_user_created_idx
  on telegram_link_tokens (user_id, created_at desc, id desc);

create unique index if not exists profiles_telegram_chat_id_unique_idx
  on profiles (telegram_chat_id)
  where telegram_chat_id is not null and btrim(telegram_chat_id) <> '';

alter table telegram_link_tokens enable row level security;

drop policy if exists "Telegram link tokens are readable by owner" on telegram_link_tokens;
create policy "Telegram link tokens are readable by owner"
  on telegram_link_tokens for select
  using (auth.uid() = user_id);

drop policy if exists "Telegram link tokens are insertable by owner" on telegram_link_tokens;
create policy "Telegram link tokens are insertable by owner"
  on telegram_link_tokens for insert
  with check (auth.uid() = user_id);

drop policy if exists "Telegram link tokens are updatable by owner" on telegram_link_tokens;
create policy "Telegram link tokens are updatable by owner"
  on telegram_link_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Telegram link tokens are deletable by owner" on telegram_link_tokens;
create policy "Telegram link tokens are deletable by owner"
  on telegram_link_tokens for delete
  using (auth.uid() = user_id);

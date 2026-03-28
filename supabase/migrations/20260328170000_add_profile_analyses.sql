create table if not exists profile_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  media_kind text not null check (media_kind in ('film', 'game')),
  scope_type text not null check (scope_type in ('format', 'platform')),
  scope_value text not null,
  user_profile jsonb not null,
  system_profile jsonb not null,
  source_titles_count int not null default 0,
  analyzed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, media_kind, scope_type, scope_value)
);

create index if not exists profile_analyses_user_idx
  on profile_analyses (user_id, media_kind, scope_type, scope_value);

drop trigger if exists set_profile_analyses_updated_at on profile_analyses;
create trigger set_profile_analyses_updated_at
before update on profile_analyses
for each row execute function set_updated_at();

alter table profile_analyses enable row level security;

drop policy if exists "Profile analyses are readable by owner" on profile_analyses;
create policy "Profile analyses are readable by owner"
  on profile_analyses for select
  using (auth.uid() = user_id);

drop policy if exists "Profile analyses are insertable by owner" on profile_analyses;
create policy "Profile analyses are insertable by owner"
  on profile_analyses for insert
  with check (auth.uid() = user_id);

drop policy if exists "Profile analyses are updatable by owner" on profile_analyses;
create policy "Profile analyses are updatable by owner"
  on profile_analyses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Profile analyses are deletable by owner" on profile_analyses;
create policy "Profile analyses are deletable by owner"
  on profile_analyses for delete
  using (auth.uid() = user_id);

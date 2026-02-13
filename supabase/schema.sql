create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  username text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('film', 'game')),
  title text not null,
  description text,
  poster_url text,
  external_id text,
  imdb_rating text,
  created_at timestamptz not null default now()
);

create unique index if not exists items_type_external_id_idx
  on items (type, external_id)
  where external_id is not null;

create table if not exists user_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  item_id uuid not null references items on delete cascade,
  rating int check (rating between -3 and 3),
  comment text,
  viewed_at timestamptz not null default now(),
  is_viewed boolean not null default true,
  view_percent int not null default 100 check (view_percent between 0 and 100),
  recommend_similar boolean not null default false,
  availability text,
  platforms text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table user_views
add column if not exists platforms text[] not null default '{}';

alter table user_views
add column if not exists availability text;

create unique index if not exists user_views_user_item_idx
  on user_views (user_id, item_id);

create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users on delete cascade,
  to_user_id uuid not null references auth.users on delete cascade,
  item_id uuid not null references items on delete cascade,
  message text,
  comment text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed', 'saved')),
  created_at timestamptz not null default now()
);

create index if not exists recommendations_to_user_id_idx
  on recommendations (to_user_id);

create index if not exists recommendations_from_user_id_idx
  on recommendations (from_user_id);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users on delete cascade,
  token text not null unique,
  max_uses int not null default 1 check (max_uses >= 1),
  used_count int not null default 0 check (used_count >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  user_id uuid not null references auth.users on delete cascade,
  other_user_id uuid not null references auth.users on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'revoked', 'blocked')),
  created_at timestamptz not null default now(),
  primary key (user_id, other_user_id),
  check (user_id <> other_user_id)
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_user_views_updated_at on user_views;
create trigger set_user_views_updated_at
before update on user_views
for each row execute function set_updated_at();

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, created_at)
  values (new.id, now())
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

alter table profiles enable row level security;
alter table items enable row level security;
alter table user_views enable row level security;
alter table recommendations enable row level security;
alter table invites enable row level security;
alter table contacts enable row level security;

drop policy if exists "Profiles are viewable by everyone" on profiles;
create policy "Profiles are viewable by everyone"
  on profiles for select
  using (true);

drop policy if exists "Profiles are editable by owner" on profiles;
create policy "Profiles are editable by owner"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Profiles are insertable by owner" on profiles;
create policy "Profiles are insertable by owner"
  on profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Items are readable by everyone" on items;
create policy "Items are readable by everyone"
  on items for select
  using (true);

drop policy if exists "Items are insertable by authenticated users" on items;
create policy "Items are insertable by authenticated users"
  on items for insert
  with check (auth.uid() is not null);

drop policy if exists "Items are updatable by authenticated users" on items;
create policy "Items are updatable by authenticated users"
  on items for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "User views are readable by owner" on user_views;
create policy "User views are readable by owner"
  on user_views for select
  using (auth.uid() = user_id);

drop policy if exists "User views are insertable by owner" on user_views;
create policy "User views are insertable by owner"
  on user_views for insert
  with check (auth.uid() = user_id);

drop policy if exists "User views are updatable by owner" on user_views;
create policy "User views are updatable by owner"
  on user_views for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "User views are deletable by owner" on user_views;
create policy "User views are deletable by owner"
  on user_views for delete
  using (auth.uid() = user_id);

drop policy if exists "Recommendations are readable by members" on recommendations;
create policy "Recommendations are readable by members"
  on recommendations for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists "Recommendations are insertable by sender" on recommendations;
create policy "Recommendations are insertable by sender"
  on recommendations for insert
  with check (auth.uid() = from_user_id);

drop policy if exists "Recommendations are updatable by recipient" on recommendations;
create policy "Recommendations are updatable by recipient"
  on recommendations for update
  using (auth.uid() = to_user_id)
  with check (auth.uid() = to_user_id);

drop policy if exists "Recommendations are deletable by sender" on recommendations;
create policy "Recommendations are deletable by sender"
  on recommendations for delete
  using (auth.uid() = from_user_id);

drop policy if exists "Invites are readable by owner" on invites;
create policy "Invites are readable by owner"
  on invites for select
  using (auth.uid() = creator_user_id);

drop policy if exists "Invites are insertable by owner" on invites;
create policy "Invites are insertable by owner"
  on invites for insert
  with check (auth.uid() = creator_user_id);

drop policy if exists "Invites are updatable by owner" on invites;
create policy "Invites are updatable by owner"
  on invites for update
  using (auth.uid() = creator_user_id)
  with check (auth.uid() = creator_user_id);

drop policy if exists "Invites are deletable by owner" on invites;
create policy "Invites are deletable by owner"
  on invites for delete
  using (auth.uid() = creator_user_id);

drop policy if exists "Contacts are readable by owner" on contacts;
create policy "Contacts are readable by owner"
  on contacts for select
  using (auth.uid() = user_id);

drop policy if exists "Contacts are insertable by owner" on contacts;
create policy "Contacts are insertable by owner"
  on contacts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Contacts are updatable by owner" on contacts;
create policy "Contacts are updatable by owner"
  on contacts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Contacts are deletable by owner" on contacts;
create policy "Contacts are deletable by owner"
  on contacts for delete
  using (auth.uid() = user_id);

create or replace function accept_invite(invite_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record invites%rowtype;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    return 'unauthorized';
  end if;

  if invite_token is null or length(invite_token) = 0 then
    return 'invalid';
  end if;

  select * into invite_record
  from invites
  where token = invite_token;

  if not found then
    return 'invalid';
  end if;

  if invite_record.creator_user_id = current_user_id then
    return 'self';
  end if;

  if invite_record.revoked_at is not null then
    return 'revoked';
  end if;

  if invite_record.expires_at < now() then
    return 'expired';
  end if;

  if invite_record.used_count >= invite_record.max_uses then
    return 'max_uses';
  end if;

  insert into contacts (user_id, other_user_id, status)
  values
    (current_user_id, invite_record.creator_user_id, 'accepted'),
    (invite_record.creator_user_id, current_user_id, 'accepted')
  on conflict (user_id, other_user_id)
  do update set status = 'accepted';

  update invites
  set used_count = used_count + 1
  where id = invite_record.id;

  return 'accepted';
end;
$$;

create or replace function remove_contact(other_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    return false;
  end if;

  delete from contacts
  where (user_id = current_user_id and other_user_id = other_user)
     or (user_id = other_user and other_user_id = current_user_id);

  delete from recommendations
  where (from_user_id = current_user_id and to_user_id = other_user)
     or (from_user_id = other_user and to_user_id = current_user_id);

  return true;
end;
$$;

create or replace function send_recommendation(
  to_user_ids uuid[],
  item_id uuid,
  comment text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_user_id uuid;
  sent_count int := 0;
  recent_count int := 0;
  safe_comment text := left(coalesce(comment, ''), 280);
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if item_id is null then
    raise exception 'Missing item';
  end if;

  select count(*)
    into recent_count
  from recommendations
  where from_user_id = current_user_id
    and created_at > (now() - interval '1 day');

  if recent_count >= 30 then
    raise exception 'Rate limit exceeded';
  end if;

  if to_user_ids is null or array_length(to_user_ids, 1) is null then
    return 0;
  end if;

  foreach target_user_id in array to_user_ids loop
    if target_user_id = current_user_id then
      continue;
    end if;

    if not exists (
      select 1 from contacts
      where user_id = current_user_id
        and other_user_id = target_user_id
        and status = 'accepted'
    ) then
      continue;
    end if;

    insert into recommendations (
      from_user_id,
      to_user_id,
      item_id,
      comment,
      status
    )
    values (
      current_user_id,
      target_user_id,
      item_id,
      safe_comment,
      'pending'
    );

    sent_count := sent_count + 1;
  end loop;

  return sent_count;
end;
$$;

grant execute on function accept_invite(text) to authenticated;
grant execute on function remove_contact(uuid) to authenticated;
grant execute on function send_recommendation(uuid[], uuid, text) to authenticated;

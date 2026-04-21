create extension if not exists "pgcrypto";
create extension if not exists pg_net;

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  username text,
  views_visible_to_friends boolean not null default false,
  settings_show_film_availability boolean not null default true,
  settings_show_game_availability boolean not null default true,
  settings_visible_game_platforms text[] not null default '{"PS","PS VR","PS PlayLink","Steam","Nintendo","PC","Xbox","Android","iOS","Other"}',
  settings_default_game_platform text,
  settings_default_film_availability text,
  settings_default_game_availability text,
  settings_default_film_is_viewed boolean,
  settings_default_game_is_viewed boolean,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table profiles
add column if not exists views_visible_to_friends boolean not null default false;

alter table profiles
add column if not exists settings_show_film_availability boolean not null default true;

alter table profiles
add column if not exists settings_show_game_availability boolean not null default true;

alter table profiles
add column if not exists settings_visible_game_platforms text[] not null default '{"PS","PS VR","PS PlayLink","Steam","Nintendo","PC","Xbox","Android","iOS","Other"}';

alter table profiles
add column if not exists settings_default_game_platform text;

alter table profiles
add column if not exists settings_default_film_availability text;

alter table profiles
add column if not exists settings_default_game_availability text;

alter table profiles
add column if not exists settings_default_film_is_viewed boolean;

alter table profiles
add column if not exists settings_default_game_is_viewed boolean;

alter table profiles
add column if not exists telegram_notifications_enabled boolean not null default false;

alter table profiles
add column if not exists telegram_chat_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_format_chk'
  ) then
    alter table profiles
      add constraint profiles_username_format_chk
      check (username is null or username ~ '^[A-Za-z0-9_-]{3,24}$');
  end if;
end;
$$;

create unique index if not exists profiles_username_lower_unique_idx
  on profiles ((lower(username)))
  where username is not null and btrim(username) <> '';

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('film', 'game')),
  film_media_type text check (film_media_type in ('movie', 'tv')),
  title text not null,
  title_original text,
  description text,
  genres text,
  director text,
  actors text,
  poster_url text,
  external_id text,
  imdb_rating text,
  trailers jsonb,
  created_at timestamptz not null default now()
);

alter table items
add column if not exists genres text;

alter table items
add column if not exists director text;

alter table items
add column if not exists actors text;

alter table items
add column if not exists trailers jsonb;

alter table items
add column if not exists title_original text;

alter table items
add column if not exists film_media_type text;

create unique index if not exists items_game_external_id_idx
  on items (type, external_id)
  where type = 'game' and external_id is not null;

create unique index if not exists items_film_media_external_id_idx
  on items (type, film_media_type, external_id)
  where type = 'film' and external_id is not null;

create table if not exists user_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  item_id uuid not null references items on delete cascade,
  created_at timestamptz not null default now(),
  rating numeric(2,1) check (rating in (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)),
  comment text,
  viewed_at timestamptz not null default now(),
  is_viewed boolean not null default true,
  view_percent int not null default 100 check (view_percent between 0 and 100),
  recommend_similar boolean not null default false,
  shishka_fit_label text,
  shishka_fit_reason text,
  shishka_fit_profile_analyzed_at timestamptz,
  shishka_fit_scope_value text,
  availability text,
  platforms text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table user_views
add column if not exists platforms text[] not null default '{}';

alter table user_views
add column if not exists availability text;

alter table user_views
add column if not exists created_at timestamptz not null default now();

alter table user_views
add column if not exists shishka_fit_label text;

alter table user_views
add column if not exists shishka_fit_reason text;

alter table user_views
add column if not exists shishka_fit_profile_analyzed_at timestamptz;

alter table user_views
add column if not exists shishka_fit_scope_value text;

create unique index if not exists user_views_user_item_idx
  on user_views (user_id, item_id);

create index if not exists user_views_user_created_idx
  on user_views (user_id, created_at desc, id desc);

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

create index if not exists recommendations_from_to_item_idx
  on recommendations (from_user_id, to_user_id, item_id);

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
  notify_film_added boolean not null default false,
  notify_film_viewed boolean not null default false,
  notify_game_added boolean not null default false,
  notify_game_viewed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, other_user_id),
  check (user_id <> other_user_id)
);

alter table contacts
add column if not exists notify_film_added boolean not null default false;

alter table contacts
add column if not exists notify_film_viewed boolean not null default false;

alter table contacts
add column if not exists notify_game_added boolean not null default false;

alter table contacts
add column if not exists notify_game_viewed boolean not null default false;

create table if not exists friend_activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users on delete cascade,
  user_view_id uuid not null references user_views on delete cascade,
  item_id uuid not null references items on delete cascade,
  media_kind text not null check (media_kind in ('film', 'game')),
  event_type text not null check (event_type in ('added', 'viewed')),
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists friend_activity_events_actor_occurred_idx
  on friend_activity_events (actor_user_id, occurred_at desc, id desc);

create index if not exists friend_activity_events_user_view_event_idx
  on friend_activity_events (user_view_id, event_type);

create table if not exists friend_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users on delete cascade,
  actor_user_id uuid not null references auth.users on delete cascade,
  event_id uuid not null references friend_activity_events on delete cascade,
  media_kind text not null check (media_kind in ('film', 'game')),
  event_type text not null check (event_type in ('added', 'viewed')),
  is_read boolean not null default false,
  read_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (recipient_user_id, event_id)
);

create index if not exists friend_notifications_recipient_unread_idx
  on friend_notifications (recipient_user_id, is_read, created_at desc, id desc);

create index if not exists friend_notifications_actor_idx
  on friend_notifications (actor_user_id, created_at desc, id desc);

create table if not exists friend_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references friend_notifications on delete cascade,
  recipient_user_id uuid not null references auth.users on delete cascade,
  channel text not null check (channel in ('telegram')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'disabled')),
  attempt_count int not null default 0,
  available_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel)
);

create index if not exists friend_notification_deliveries_status_idx
  on friend_notification_deliveries (channel, status, available_at, created_at);

create index if not exists friend_notification_deliveries_recipient_idx
  on friend_notification_deliveries (recipient_user_id, created_at desc, id desc);

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

drop trigger if exists set_profile_analyses_updated_at on profile_analyses;
create trigger set_profile_analyses_updated_at
before update on profile_analyses
for each row execute function set_updated_at();

create or replace function create_friend_activity_event(
  input_actor_user_id uuid,
  input_user_view_id uuid,
  input_item_id uuid,
  input_event_type text,
  input_occurred_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item_record record;
  inserted_event_id uuid;
  event_payload jsonb;
begin
  if input_actor_user_id is null
     or input_user_view_id is null
     or input_item_id is null
     or input_event_type not in ('added', 'viewed') then
    return null;
  end if;

  select type, title, poster_url
    into item_record
  from items
  where id = input_item_id;

  if not found or item_record.type not in ('film', 'game') then
    return null;
  end if;

  event_payload := jsonb_build_object(
    'itemId', input_item_id,
    'userViewId', input_user_view_id,
    'title', item_record.title,
    'posterUrl', item_record.poster_url,
    'mediaKind', item_record.type,
    'eventType', input_event_type,
    'occurredAt', coalesce(input_occurred_at, now())
  );

  insert into friend_activity_events (
    actor_user_id,
    user_view_id,
    item_id,
    media_kind,
    event_type,
    occurred_at,
    payload,
    dedupe_key
  )
  values (
    input_actor_user_id,
    input_user_view_id,
    input_item_id,
    item_record.type,
    input_event_type,
    coalesce(input_occurred_at, now()),
    event_payload,
    input_user_view_id::text || ':' || input_event_type
  )
  on conflict (dedupe_key)
  do update set dedupe_key = friend_activity_events.dedupe_key
  returning id into inserted_event_id;

  insert into friend_notifications (
    recipient_user_id,
    actor_user_id,
    event_id,
    media_kind,
    event_type,
    payload,
    created_at
  )
  select
    contacts.user_id,
    input_actor_user_id,
    inserted_event_id,
    item_record.type,
    input_event_type,
    event_payload,
    coalesce(input_occurred_at, now())
  from contacts
  where contacts.other_user_id = input_actor_user_id
    and contacts.status = 'accepted'
    and contacts.user_id <> input_actor_user_id
    and (
      (item_record.type = 'film' and input_event_type = 'added' and contacts.notify_film_added)
      or (item_record.type = 'film' and input_event_type = 'viewed' and contacts.notify_film_viewed)
      or (item_record.type = 'game' and input_event_type = 'added' and contacts.notify_game_added)
      or (item_record.type = 'game' and input_event_type = 'viewed' and contacts.notify_game_viewed)
    )
  on conflict (recipient_user_id, event_id) do nothing;

  return inserted_event_id;
end;
$$;

create or replace function enqueue_friend_notification_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_profile record;
begin
  select telegram_notifications_enabled, telegram_chat_id
    into recipient_profile
  from profiles
  where id = new.recipient_user_id;

  if not found then
    return new;
  end if;

  if recipient_profile.telegram_notifications_enabled
     and recipient_profile.telegram_chat_id is not null
     and btrim(recipient_profile.telegram_chat_id) <> '' then
    insert into friend_notification_deliveries (
      notification_id,
      recipient_user_id,
      channel,
      status,
      payload
    )
    values (
      new.id,
      new.recipient_user_id,
      'telegram',
      'pending',
      new.payload || jsonb_build_object(
        'notificationId', new.id,
        'recipientUserId', new.recipient_user_id,
        'actorUserId', new.actor_user_id,
        'telegramChatId', recipient_profile.telegram_chat_id
      )
    )
    on conflict (notification_id, channel) do nothing;
  end if;

  return new;
end;
$$;

create or replace function request_telegram_dispatch(
  dispatch_url text,
  dispatch_secret text,
  dispatch_limit int default 20,
  dispatch_dry_run boolean default false
)
returns bigint
language sql
security definer
set search_path = public
as $$
  select net.http_post(
    url := dispatch_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || dispatch_secret
    ),
    body := jsonb_build_object(
      'limit', greatest(1, least(dispatch_limit, 100)),
      'dryRun', dispatch_dry_run
    ),
    timeout_milliseconds := 10000
  );
$$;

drop trigger if exists enqueue_friend_notification_delivery on friend_notifications;
create trigger enqueue_friend_notification_delivery
after insert on friend_notifications
for each row execute function enqueue_friend_notification_delivery();

create or replace function handle_user_view_friend_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform create_friend_activity_event(
      new.user_id,
      new.id,
      new.item_id,
      'added',
      coalesce(new.created_at, now())
    );

    if new.is_viewed then
      perform create_friend_activity_event(
        new.user_id,
        new.id,
        new.item_id,
        'viewed',
        coalesce(new.viewed_at, new.updated_at, new.created_at, now())
      );
    end if;

    return new;
  end if;

  if coalesce(old.is_viewed, false) = false and coalesce(new.is_viewed, false) = true then
    perform create_friend_activity_event(
      new.user_id,
      new.id,
      new.item_id,
      'viewed',
      coalesce(new.viewed_at, new.updated_at, now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists handle_user_view_friend_activity on user_views;
create trigger handle_user_view_friend_activity
after insert or update of is_viewed on user_views
for each row execute function handle_user_view_friend_activity();

drop trigger if exists set_friend_notification_deliveries_updated_at on friend_notification_deliveries;
create trigger set_friend_notification_deliveries_updated_at
before update on friend_notification_deliveries
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
alter table profile_analyses enable row level security;
alter table friend_activity_events enable row level security;
alter table friend_notifications enable row level security;
alter table friend_notification_deliveries enable row level security;
alter table telegram_link_tokens enable row level security;

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

drop policy if exists "User views are readable by friends when allowed" on user_views;
create policy "User views are readable by friends when allowed"
  on user_views for select
  using (
    exists (
      select 1
      from profiles
      where id = user_views.user_id
        and views_visible_to_friends = true
    )
    and exists (
      select 1
      from contacts
      where user_id = auth.uid()
        and other_user_id = user_views.user_id
        and status = 'accepted'
    )
  );

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

drop policy if exists "Friend activity events are readable by actor" on friend_activity_events;
create policy "Friend activity events are readable by actor"
  on friend_activity_events for select
  using (auth.uid() = actor_user_id);

drop policy if exists "Friend notifications are readable by recipient" on friend_notifications;
create policy "Friend notifications are readable by recipient"
  on friend_notifications for select
  using (auth.uid() = recipient_user_id);

drop policy if exists "Friend notifications are updatable by recipient" on friend_notifications;
create policy "Friend notifications are updatable by recipient"
  on friend_notifications for update
  using (auth.uid() = recipient_user_id)
  with check (auth.uid() = recipient_user_id);

drop policy if exists "Friend notifications are deletable by recipient" on friend_notifications;
create policy "Friend notifications are deletable by recipient"
  on friend_notifications for delete
  using (auth.uid() = recipient_user_id);

drop policy if exists "Friend notification deliveries are readable by recipient" on friend_notification_deliveries;
create policy "Friend notification deliveries are readable by recipient"
  on friend_notification_deliveries for select
  using (auth.uid() = recipient_user_id);

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

  delete from friend_notifications
  where (recipient_user_id = current_user_id and actor_user_id = other_user)
     or (recipient_user_id = other_user and actor_user_id = current_user_id);

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
  input_item_id alias for $2;
  target_user_id uuid;
  sent_count int := 0;
  recent_count int := 0;
  safe_comment text := left(coalesce(comment, ''), 280);
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if input_item_id is null then
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

    if exists (
      select 1
      from user_views uv
      where uv.user_id = target_user_id
        and uv.item_id = input_item_id
    ) then
      continue;
    end if;

    if exists (
      select 1
      from recommendations r
      where r.from_user_id = current_user_id
        and r.to_user_id = target_user_id
        and r.item_id = input_item_id
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
      input_item_id,
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

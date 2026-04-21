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

alter table friend_activity_events enable row level security;
alter table friend_notifications enable row level security;

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

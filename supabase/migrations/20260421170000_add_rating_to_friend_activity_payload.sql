create or replace function create_friend_activity_event(
  input_actor_user_id uuid,
  input_user_view_id uuid,
  input_item_id uuid,
  input_event_type text,
  input_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item_record record;
  view_record record;
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

  select rating
    into view_record
  from user_views
  where id = input_user_view_id;

  if item_record.type is null or item_record.type not in ('film', 'game') then
    return null;
  end if;

  event_payload := jsonb_build_object(
    'itemId', input_item_id,
    'userViewId', input_user_view_id,
    'title', item_record.title,
    'posterUrl', item_record.poster_url,
    'rating', view_record.rating,
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

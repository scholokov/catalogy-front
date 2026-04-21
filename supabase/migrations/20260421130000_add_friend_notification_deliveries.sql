alter table profiles
  add column if not exists telegram_notifications_enabled boolean not null default false;

alter table profiles
  add column if not exists telegram_chat_id text;

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

drop trigger if exists set_friend_notification_deliveries_updated_at on friend_notification_deliveries;
create trigger set_friend_notification_deliveries_updated_at
before update on friend_notification_deliveries
for each row execute function set_updated_at();

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

drop trigger if exists enqueue_friend_notification_delivery on friend_notifications;
create trigger enqueue_friend_notification_delivery
after insert on friend_notifications
for each row execute function enqueue_friend_notification_delivery();

alter table friend_notification_deliveries enable row level security;

drop policy if exists "Friend notification deliveries are readable by recipient" on friend_notification_deliveries;
create policy "Friend notification deliveries are readable by recipient"
  on friend_notification_deliveries for select
  using (auth.uid() = recipient_user_id);

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

alter table recommendations
  add column if not exists status text not null default 'pending'
  check (status in ('pending', 'accepted', 'dismissed', 'saved'));

alter table recommendations
  add column if not exists comment text;

create index if not exists recommendations_to_user_id_idx
  on recommendations (to_user_id);

create index if not exists recommendations_from_user_id_idx
  on recommendations (from_user_id);

alter table invites enable row level security;
alter table contacts enable row level security;

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

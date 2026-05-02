create table if not exists public.statistics_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  media_kind text not null check (media_kind in ('film', 'game')),
  payload jsonb,
  is_stale boolean not null default true,
  last_built_at timestamptz,
  last_invalidated_at timestamptz not null default timezone('utc', now()),
  last_rebuild_started_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, media_kind)
);

create index if not exists statistics_snapshots_stale_idx
  on public.statistics_snapshots (is_stale, updated_at desc);

create or replace function public.touch_statistics_snapshot(
  p_user_id uuid,
  p_media_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_media_kind not in ('film', 'game') then
    return;
  end if;

  insert into public.statistics_snapshots (
    user_id,
    media_kind,
    is_stale,
    last_invalidated_at,
    last_rebuild_started_at,
    updated_at
  )
  values (
    p_user_id,
    p_media_kind,
    true,
    timezone('utc', now()),
    null,
    timezone('utc', now())
  )
  on conflict (user_id, media_kind)
  do update
  set
    is_stale = true,
    last_invalidated_at = excluded.last_invalidated_at,
    last_rebuild_started_at = null,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.mark_statistics_snapshots_dirty_on_user_views_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_media_kind text;
  next_media_kind text;
  has_stats_change boolean := false;
begin
  if tg_op = 'INSERT' then
    select type into next_media_kind
    from public.items
    where id = new.item_id;

    perform public.touch_statistics_snapshot(new.user_id, next_media_kind);
    return new;
  end if;

  if tg_op = 'DELETE' then
    select type into previous_media_kind
    from public.items
    where id = old.item_id;

    perform public.touch_statistics_snapshot(old.user_id, previous_media_kind);
    return old;
  end if;

  has_stats_change :=
    new.user_id is distinct from old.user_id
    or new.item_id is distinct from old.item_id
    or new.is_viewed is distinct from old.is_viewed
    or new.rating is distinct from old.rating
    or new.view_percent is distinct from old.view_percent
    or new.viewed_at is distinct from old.viewed_at
    or new.platforms is distinct from old.platforms;

  if not has_stats_change then
    return new;
  end if;

  select type into previous_media_kind
  from public.items
  where id = old.item_id;

  select type into next_media_kind
  from public.items
  where id = new.item_id;

  perform public.touch_statistics_snapshot(old.user_id, previous_media_kind);

  if new.user_id is distinct from old.user_id
     or next_media_kind is distinct from previous_media_kind then
    perform public.touch_statistics_snapshot(new.user_id, next_media_kind);
  end if;

  return new;
end;
$$;

drop trigger if exists user_views_statistics_snapshot_dirty on public.user_views;

create trigger user_views_statistics_snapshot_dirty
after insert or update or delete on public.user_views
for each row
execute function public.mark_statistics_snapshots_dirty_on_user_views_change();

alter table public.statistics_snapshots enable row level security;

drop policy if exists "Users can read own statistics snapshots"
on public.statistics_snapshots;

create policy "Users can read own statistics snapshots"
on public.statistics_snapshots
for select
to authenticated
using (auth.uid() = user_id);

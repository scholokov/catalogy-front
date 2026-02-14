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

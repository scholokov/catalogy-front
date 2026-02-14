alter table profiles
add column if not exists views_visible_to_friends boolean not null default false;

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

alter table user_views
  add column if not exists created_at timestamptz;

update user_views
set created_at = coalesce(viewed_at, now())
where created_at is null;

alter table user_views
  alter column created_at set default now();

alter table user_views
  alter column created_at set not null;

create index if not exists user_views_user_created_idx
  on user_views (user_id, created_at desc, id desc);

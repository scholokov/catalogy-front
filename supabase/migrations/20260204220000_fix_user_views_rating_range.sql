alter table public.user_views
  drop constraint if exists user_views_rating_check;

alter table public.user_views
  add constraint user_views_rating_check
  check (rating between -3 and 3);

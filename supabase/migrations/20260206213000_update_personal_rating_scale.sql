alter table user_views
  drop constraint if exists user_views_rating_check;

update user_views
set rating = case
  when rating is null then null
  when rating >= 1 and rating <= 5 then rating
  else greatest(
    1,
    least(
      5,
      round((((rating + 3)::numeric / 6) * 4 + 1)::numeric)::int
    )
  )
end;

alter table user_views
  add constraint user_views_rating_check
  check (rating between 1 and 5);

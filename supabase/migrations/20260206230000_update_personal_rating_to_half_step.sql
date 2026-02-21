alter table user_views
  drop constraint if exists user_views_rating_check;

alter table user_views
  alter column rating type numeric(2,1)
  using case
    when rating is null then null
    else rating::numeric(2,1)
  end;

alter table user_views
  add constraint user_views_rating_check
  check (
    rating between 1 and 5
    and rating * 2 = trunc(rating * 2)
  );

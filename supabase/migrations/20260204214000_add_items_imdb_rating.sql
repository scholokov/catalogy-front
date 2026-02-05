alter table public.items
  add column if not exists imdb_rating text;

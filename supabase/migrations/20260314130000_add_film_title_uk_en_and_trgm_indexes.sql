create extension if not exists pg_trgm;

alter table public.items
  add column if not exists title_uk text;

alter table public.items
  add column if not exists title_en text;

update public.items
set title_uk = title
where type = 'film'
  and title_uk is null
  and title is not null;

create index if not exists idx_items_film_title_trgm
  on public.items using gin (title gin_trgm_ops)
  where type = 'film' and title is not null;

create index if not exists idx_items_film_title_uk_trgm
  on public.items using gin (title_uk gin_trgm_ops)
  where type = 'film' and title_uk is not null;

create index if not exists idx_items_film_title_en_trgm
  on public.items using gin (title_en gin_trgm_ops)
  where type = 'film' and title_en is not null;

create index if not exists idx_items_film_title_original_trgm
  on public.items using gin (title_original gin_trgm_ops)
  where type = 'film' and title_original is not null;

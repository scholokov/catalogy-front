alter table public.genres
drop constraint if exists genres_source_check;

alter table public.genres
add constraint genres_source_check
check (source in ('tmdb', 'rawg', 'igdb'));

alter table items
add column if not exists film_media_type text;

alter table items
drop constraint if exists items_film_media_type_check;

alter table items
add constraint items_film_media_type_check
check (film_media_type in ('movie', 'tv') or film_media_type is null);

update items
set film_media_type = 'movie'
where type = 'film' and film_media_type is null;

alter table items
drop constraint if exists items_film_requires_media_type_check;

alter table items
add constraint items_film_requires_media_type_check
check (type <> 'film' or film_media_type is not null);

drop index if exists items_type_external_id_idx;

create unique index if not exists items_game_external_id_idx
on items (type, external_id)
where type = 'game' and external_id is not null;

create unique index if not exists items_film_media_external_id_idx
on items (type, film_media_type, external_id)
where type = 'film' and external_id is not null;

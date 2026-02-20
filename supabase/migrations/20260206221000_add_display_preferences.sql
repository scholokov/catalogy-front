alter table profiles
  add column if not exists settings_show_film_availability boolean not null default true;

alter table profiles
  add column if not exists settings_show_game_availability boolean not null default true;

alter table profiles
  add column if not exists settings_visible_game_platforms text[] not null default '{"PS","Steam","PC","Android","iOS","Xbox"}';

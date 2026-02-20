alter table profiles
  add column if not exists settings_default_film_availability text;

alter table profiles
  add column if not exists settings_default_game_availability text;

alter table profiles
  add column if not exists settings_default_film_is_viewed boolean;

alter table profiles
  add column if not exists settings_default_game_is_viewed boolean;

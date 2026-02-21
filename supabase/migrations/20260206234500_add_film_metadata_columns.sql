alter table items
  add column if not exists genres text;

alter table items
  add column if not exists director text;

alter table items
  add column if not exists actors text;

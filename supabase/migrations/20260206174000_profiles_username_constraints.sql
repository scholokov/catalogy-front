do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_format_chk'
  ) then
    alter table profiles
      add constraint profiles_username_format_chk
      check (username is null or username ~ '^[A-Za-z0-9_-]{3,24}$');
  end if;
end;
$$;

create unique index if not exists profiles_username_lower_unique_idx
  on profiles ((lower(username)))
  where username is not null and btrim(username) <> '';

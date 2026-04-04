create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('tmdb')),
  source_person_id text not null,
  name text not null,
  name_original text,
  profile_url text,
  biography text,
  birthday date,
  deathday date,
  place_of_birth text,
  known_for_department text,
  popularity numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_person_id)
);

create index if not exists people_name_idx
  on public.people (name);

drop trigger if exists set_people_updated_at on public.people;
create trigger set_people_updated_at
before update on public.people
for each row execute function set_updated_at();

alter table public.people enable row level security;

drop policy if exists "People are readable by authenticated users" on public.people;
create policy "People are readable by authenticated users"
  on public.people for select
  using (auth.uid() is not null);

drop policy if exists "People are insertable by authenticated users" on public.people;
create policy "People are insertable by authenticated users"
  on public.people for insert
  with check (auth.uid() is not null);

drop policy if exists "People are updatable by authenticated users" on public.people;
create policy "People are updatable by authenticated users"
  on public.people for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "People are deletable by authenticated users" on public.people;
create policy "People are deletable by authenticated users"
  on public.people for delete
  using (auth.uid() is not null);

create table if not exists public.item_people (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  role_kind text not null check (role_kind in ('actor', 'director', 'writer', 'producer', 'creator', 'other')),
  credit_group text not null check (credit_group in ('cast', 'crew')),
  department text,
  job text,
  character_name text,
  credit_order int,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists item_people_unique_idx
  on public.item_people (item_id, person_id, role_kind, credit_group, credit_order);

create index if not exists item_people_person_idx
  on public.item_people (person_id, role_kind, credit_group, credit_order);

create index if not exists item_people_item_idx
  on public.item_people (item_id, role_kind, credit_group, credit_order);

alter table public.item_people enable row level security;

drop policy if exists "Item people are readable by authenticated users" on public.item_people;
create policy "Item people are readable by authenticated users"
  on public.item_people for select
  using (auth.uid() is not null);

drop policy if exists "Item people are insertable by authenticated users" on public.item_people;
create policy "Item people are insertable by authenticated users"
  on public.item_people for insert
  with check (auth.uid() is not null);

drop policy if exists "Item people are updatable by authenticated users" on public.item_people;
create policy "Item people are updatable by authenticated users"
  on public.item_people for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "Item people are deletable by authenticated users" on public.item_people;
create policy "Item people are deletable by authenticated users"
  on public.item_people for delete
  using (auth.uid() is not null);

create table if not exists public.genres (
  id uuid primary key default gen_random_uuid(),
  media_kind text not null check (media_kind in ('film', 'game')),
  source text not null check (source in ('tmdb', 'rawg')),
  source_genre_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (media_kind, source, source_genre_id)
);

create index if not exists genres_name_idx
  on public.genres (media_kind, name);

drop trigger if exists set_genres_updated_at on public.genres;
create trigger set_genres_updated_at
before update on public.genres
for each row execute function set_updated_at();

alter table public.genres enable row level security;

drop policy if exists "Genres are readable by authenticated users" on public.genres;
create policy "Genres are readable by authenticated users"
  on public.genres for select
  using (auth.uid() is not null);

drop policy if exists "Genres are insertable by authenticated users" on public.genres;
create policy "Genres are insertable by authenticated users"
  on public.genres for insert
  with check (auth.uid() is not null);

drop policy if exists "Genres are updatable by authenticated users" on public.genres;
create policy "Genres are updatable by authenticated users"
  on public.genres for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "Genres are deletable by authenticated users" on public.genres;
create policy "Genres are deletable by authenticated users"
  on public.genres for delete
  using (auth.uid() is not null);

create table if not exists public.item_genres (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  genre_id uuid not null references public.genres (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (item_id, genre_id)
);

create index if not exists item_genres_genre_idx
  on public.item_genres (genre_id, item_id);

create index if not exists item_genres_item_idx
  on public.item_genres (item_id, genre_id);

alter table public.item_genres enable row level security;

drop policy if exists "Item genres are readable by authenticated users" on public.item_genres;
create policy "Item genres are readable by authenticated users"
  on public.item_genres for select
  using (auth.uid() is not null);

drop policy if exists "Item genres are insertable by authenticated users" on public.item_genres;
create policy "Item genres are insertable by authenticated users"
  on public.item_genres for insert
  with check (auth.uid() is not null);

drop policy if exists "Item genres are updatable by authenticated users" on public.item_genres;
create policy "Item genres are updatable by authenticated users"
  on public.item_genres for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "Item genres are deletable by authenticated users" on public.item_genres;
create policy "Item genres are deletable by authenticated users"
  on public.item_genres for delete
  using (auth.uid() is not null);

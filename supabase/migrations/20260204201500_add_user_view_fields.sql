alter table public.user_views
  add column if not exists is_viewed boolean not null default true,
  add column if not exists view_percent int not null default 100 check (view_percent between 0 and 100),
  add column if not exists recommend_similar boolean not null default false;

drop policy if exists "Items are insertable by authenticated users" on public.items;
create policy "Items are insertable by authenticated users"
  on public.items for insert
  with check (auth.uid() is not null);

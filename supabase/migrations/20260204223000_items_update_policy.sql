drop policy if exists "Items are updatable by authenticated users" on public.items;
create policy "Items are updatable by authenticated users"
  on public.items for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- MajaDor 0002: the shared shopping list.
--
-- SHARED OBJECTS: one. The last statement adds majador.shopping_items to the
-- project-wide `supabase_realtime` publication, which is what makes changes
-- show up live on the other phone. It is additive: it does not change which
-- other tables are published, and Realtime still applies this table's RLS, so
-- only household members receive the rows. Everything else lives in `majador`.
--
-- One transaction: if any statement fails, nothing is applied.

begin;

create table majador.shopping_items (
  -- The phone creates the id, so an item added without signal can be queued
  -- and sent later without ever being inserted twice.
  id        uuid primary key default gen_random_uuid(),
  text      text not null check (char_length(btrim(text)) between 1 and 200),
  added_by  uuid default auth.uid() references auth.users (id) on delete set null,
  added_at  timestamptz not null default now(),
  -- null = still on the list; set = bought (and when / by whom).
  bought_at timestamptz,
  bought_by uuid references auth.users (id) on delete set null
);

create index shopping_items_bought_at_idx on majador.shopping_items (bought_at);

alter table majador.shopping_items enable row level security;

-- One list for the whole household: any member can add, tick off, move back
-- and delete any item.
create policy "members share the shopping list"
  on majador.shopping_items for all
  to authenticated
  using (majador.is_member())
  with check (majador.is_member());

-- Grants are not auto-applied on this project. Nothing for `anon`.
grant select, insert, update, delete on majador.shopping_items to authenticated;
grant select, insert, update, delete on majador.shopping_items to service_role;

-- SHARED: publish this table's changes over Realtime.
alter publication supabase_realtime add table majador.shopping_items;

commit;

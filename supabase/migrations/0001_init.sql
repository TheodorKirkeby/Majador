-- MajaDor 0001: schema, household members and push subscriptions.
--
-- SHARED OBJECTS: none are created, altered or dropped. Everything this file
-- creates lives in the new `majador` schema: no extensions, no `public`, no
-- roles, no cron jobs, no default privileges, no Realtime config.
-- The one point of contact with shared state: two foreign keys REFERENCE the
-- project-wide `auth.users` table (so deleting a user also deletes their
-- MajaDor rows). That adds no columns, policies or user-visible triggers to
-- auth.users and changes nothing for svin / ulv / tdc / advent, none of which
-- use logins. The whole file is one transaction: if any statement fails
-- (e.g. a `majador` table somehow already exists) nothing is applied.
--
-- MajaDor is the first app on this project to use Supabase Auth logins, so the
-- two users (Theodor, Maja) are created by hand in the dashboard:
-- Authentication -> Users -> Add user (with "Auto Confirm User" ticked).
--
-- After running this file:
--   1. ADD `majador` to the exposed schemas (Project Settings -> Data API).
--      Append it; the list must still contain public, graphql_public, svin,
--      ulv, tdc, advent or those apps stop working.
--   2. Run the member insert at the bottom (kept commented out so no email
--      addresses are committed).
--
-- Access model: a row in majador.members is what makes a logged-in user part
-- of the household. Every table's RLS goes through majador.is_member(), so an
-- account that merely exists on the shared project sees nothing.

begin;

create schema if not exists majador;

grant usage on schema majador to authenticated, service_role;

-- ── Members ────────────────────────────────────────────────────────────────

create table majador.members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- SECURITY DEFINER so policies on other tables (and on members itself) can
-- check membership without recursing into members' own RLS.
create function majador.is_member()
returns boolean
language sql
stable
security definer
set search_path = majador
as $$
  select exists (select 1 from majador.members where user_id = auth.uid());
$$;

revoke all on function majador.is_member() from public;
grant execute on function majador.is_member() to authenticated, service_role;

alter table majador.members enable row level security;

create policy "members can see the household"
  on majador.members for select
  to authenticated
  using (majador.is_member());

-- No insert/update/delete policies: membership is managed from the SQL Editor.

-- ── Push subscriptions (one row per device) ────────────────────────────────

create table majador.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on majador.push_subscriptions (user_id);

alter table majador.push_subscriptions enable row level security;

create policy "members manage their own devices"
  on majador.push_subscriptions for all
  to authenticated
  using (majador.is_member() and user_id = auth.uid())
  with check (majador.is_member() and user_id = auth.uid());

-- ── Push sender RPCs ───────────────────────────────────────────────────────
-- The majador-push Edge Function runs with the CALLER's login (the project's
-- legacy service_role key is disabled, and this way the function needs no
-- database secret at all). RLS only shows a member their own devices, so these
-- two SECURITY DEFINER functions let any household member read every
-- household device and clean up dead ones. Non-members get nothing.

create function majador.push_targets()
returns table (id bigint, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = majador
as $$
  select s.id, s.endpoint, s.p256dh, s.auth
  from majador.push_subscriptions s
  where majador.is_member();
$$;

create function majador.remove_push_subscriptions(p_ids bigint[])
returns void
language sql
security definer
set search_path = majador
as $$
  delete from majador.push_subscriptions
  where id = any(p_ids) and majador.is_member();
$$;

-- New functions are executable by PUBLIC by default; close that.
revoke all on function majador.push_targets() from public;
revoke all on function majador.remove_push_subscriptions(bigint[]) from public;
grant execute on function majador.push_targets() to authenticated;
grant execute on function majador.remove_push_subscriptions(bigint[]) to authenticated;

-- ── Grants ─────────────────────────────────────────────────────────────────
-- Grants are not auto-applied on this project; without these clients fail
-- with 42501. Nothing is granted to `anon`: MajaDor has no logged-out access.
-- Every grant below names an object inside `majador`.

grant select on majador.members to authenticated;
grant select, insert, update, delete on majador.push_subscriptions to authenticated;
grant select, insert, update, delete on majador.members, majador.push_subscriptions to service_role;

commit;

-- ── Run separately, after creating the two users in the dashboard ──────────
-- insert into majador.members (user_id, display_name)
-- select id, case email
--              when 'THEODORS-EMAIL' then 'Theodor'
--              when 'MAJAS-EMAIL'    then 'Maja'
--            end
-- from auth.users
-- where email in ('THEODORS-EMAIL', 'MAJAS-EMAIL');

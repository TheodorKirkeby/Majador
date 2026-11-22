-- MajaDor 0004: the film list (movies and series) with one rating per person.
--
-- SHARED OBJECTS: one. The last statement adds majador.movies and
-- majador.movie_ratings to the project-wide `supabase_realtime` publication,
-- which is what makes changes show up live on the other phone. It is
-- additive: it does not change which other tables are published, and Realtime
-- still applies these tables' RLS, so only household members receive the
-- rows. Everything else lives in `majador`.
--
-- One transaction: if any statement fails, nothing is applied.

begin;

create table majador.movies (
  -- The phone creates the id, so a film added without signal can be queued
  -- and sent later without ever being inserted twice.
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 1000),
  kind        text not null default 'movie' check (kind in ('movie', 'series')),
  -- Where it was watched. Optional.
  watched_on  text check (
    watched_on in ('netflix', 'sky', 'hbo', 'disney', 'dr', 'viaplay', 'tv2', 'cinema', 'other')
  ),
  added_by    uuid default auth.uid() references auth.users (id) on delete set null,
  added_at    timestamptz not null default now()
);

-- One rating per person per film: 1 to 10, one decimal allowed (5.5).
create table majador.movie_ratings (
  movie_id uuid not null references majador.movies (id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating   numeric(3, 1) not null check (rating between 1 and 10),
  rated_at timestamptz not null default now(),
  primary key (movie_id, user_id)
);

alter table majador.movies enable row level security;
alter table majador.movie_ratings enable row level security;

-- One list for the whole household: any member can add, edit and delete.
create policy "members share the film list"
  on majador.movies for all
  to authenticated
  using (majador.is_member())
  with check (majador.is_member());

-- Everyone in the household sees every rating, but a rating can only be
-- given, changed or removed by the person it belongs to.
create policy "members see all ratings"
  on majador.movie_ratings for select
  to authenticated
  using (majador.is_member());

create policy "members add their own rating"
  on majador.movie_ratings for insert
  to authenticated
  with check (majador.is_member() and user_id = auth.uid());

create policy "members change their own rating"
  on majador.movie_ratings for update
  to authenticated
  using (majador.is_member() and user_id = auth.uid())
  with check (majador.is_member() and user_id = auth.uid());

create policy "members remove their own rating"
  on majador.movie_ratings for delete
  to authenticated
  using (majador.is_member() and user_id = auth.uid());

-- Grants are not auto-applied on this project. Nothing for `anon`.
grant select, insert, update, delete on majador.movies, majador.movie_ratings to authenticated;
grant select, insert, update, delete on majador.movies, majador.movie_ratings to service_role;

-- SHARED: publish these tables' changes over Realtime.
alter publication supabase_realtime add table majador.movies, majador.movie_ratings;

commit;

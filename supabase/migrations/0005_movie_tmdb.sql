-- MajaDor 0005: summary and poster for films, fetched from TMDB.
--
-- SHARED OBJECTS: none. Four new columns on majador.movies.
--
-- When a film is added, the app suggests matches from The Movie Database
-- (through the majador-tmdb Edge Function). Picking one stores its summary,
-- poster and year here. All four are optional: a title with no match is still
-- a valid film. `description` (0004) is from now on the household's own
-- opinion; `summary` is what the film is about.
--
-- One transaction: if any statement fails, nothing is applied.

begin;

alter table majador.movies
  add column summary     text check (char_length(summary) <= 2000),
  -- TMDB's image path ("/abc123.jpg"); the app puts the image host in front.
  add column poster_path text check (char_length(poster_path) <= 200),
  add column year        smallint,
  -- TMDB's id. Film and series ids overlap; `kind` tells which one it is.
  add column tmdb_id     integer;

commit;

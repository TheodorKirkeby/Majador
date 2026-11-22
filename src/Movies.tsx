import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { posterUrl, searchTmdb, type Match } from './lib/tmdb'
import {
  addMovie,
  getSnapshot,
  PLACES,
  rateMovie,
  removeMovie,
  subscribe,
  updateMovie,
  type Movie,
  type MovieKind,
} from './lib/store'

/** 8.5 -> "8,5", 9 -> "9". */
const formatRating = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 1 })

const placeLabel = (id: string | null) => PLACES.find((p) => p.id === id)?.label ?? null
const kindLabel = (kind: MovieKind) => (kind === 'series' ? 'Serie' : 'Film')

function average(movie: Movie): number | null {
  const given = Object.values(movie.ratings)
  return given.length ? given.reduce((a, b) => a + b, 0) / given.length : null
}

type Props = {
  userId: string
  /** The search screen is opened from the magnifying glass in the top bar. */
  searching: boolean
  onCloseSearch: () => void
}

export default function Movies({ userId, searching, onCloseSearch }: Props) {
  const { movies, members, status, pending } = useSyncExternalStore(subscribe, getSnapshot)
  // 'new' = the add form; an id = that film's form.
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const sorted = [...movies].sort((a, b) => b.added_at.localeCompare(a.added_at))
  const people = Object.entries(members).sort((a, b) => a[1].localeCompare(b[1], 'da'))
  const opened = open && open !== 'new' ? movies.find((m) => m.id === open) : undefined

  const words = query.toLocaleLowerCase('da').split(/\s+/).filter(Boolean)
  const found = sorted.filter((m) => {
    const text = [m.title, m.description, m.summary, m.year, kindLabel(m.kind), placeLabel(m.watched_on)]
      .join(' ')
      .toLocaleLowerCase('da')
    return words.every((w) => text.includes(w))
  })

  function closeSearch() {
    setQuery('')
    onCloseSearch()
  }

  return (
    <>
      {status === 'offline' && (
        <p className="banner">
          Ingen forbindelse.{' '}
          {pending > 0
            ? `${pending} ${pending === 1 ? 'ændring' : 'ændringer'} sendes, når du er online igen.`
            : 'Viser den senest gemte liste.'}
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="empty">Ingen film eller serier endnu. Tilføj den første herunder.</p>
      ) : (
        <ul className="items">
          {sorted.map((movie) => (
            <MovieItem key={movie.id} movie={movie} people={people} onOpen={setOpen} />
          ))}
        </ul>
      )}

      <div className="dock">
        <button onClick={() => setOpen('new')}>Tilføj film eller serie</button>
      </div>

      {searching && (
        <div className="search" role="dialog" aria-modal="true" aria-label="Søg i film og serier">
          <div className="search-inner">
            <div className="search-bar">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Søg i film og serier"
                aria-label="Søg i film og serier"
                enterKeyHint="search"
                autoComplete="off"
                autoFocus
              />
              <button className="link" onClick={closeSearch}>
                Luk
              </button>
            </div>
            {found.length === 0 ? (
              <p className="empty">
                {movies.length === 0 ? 'Der er ingen film eller serier endnu.' : 'Ingen resultater.'}
              </p>
            ) : (
              <ul className="items">
                {found.map((movie) => (
                  <MovieItem key={movie.id} movie={movie} people={people} onOpen={setOpen} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {(open === 'new' || opened) && (
        <MovieSheet
          key={open}
          movie={opened}
          userId={userId}
          others={people.filter(([id]) => id !== userId)}
          addedBy={opened?.added_by ? members[opened.added_by] : undefined}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

type ItemProps = { movie: Movie; people: [string, string][]; onOpen: (id: string) => void }

/** One film in the list (and in the search results). */
function MovieItem({ movie, people, onOpen }: ItemProps) {
  const score = average(movie)
  const sub = [kindLabel(movie.kind), movie.year, placeLabel(movie.watched_on)].filter(Boolean)
  return (
    <li>
      <button className="movie" onClick={() => onOpen(movie.id)}>
        {movie.poster_path && (
          <img className="poster" src={posterUrl(movie.poster_path)} alt="" loading="lazy" />
        )}
        <span className="movie-main">
          <span className="movie-title">{movie.title}</span>
          <span className="movie-sub">{sub.join(' · ')}</span>
          {movie.summary && <span className="movie-desc">{movie.summary}</span>}
          {movie.description && (
            <span className="movie-desc opinion">“{movie.description}”</span>
          )}
          <span className="movie-ratings">
            {people.map(([id, name]) => (
              <span key={id} className={movie.ratings[id] == null ? 'missing' : ''}>
                {name} <b>{movie.ratings[id] == null ? '–' : formatRating(movie.ratings[id])}</b>
              </span>
            ))}
          </span>
        </span>
        {score !== null && <span className="movie-score">{formatRating(score)}</span>}
      </button>
    </li>
  )
}

type Info = Pick<Movie, 'summary' | 'poster_path' | 'year' | 'tmdb_id'>
const NO_INFO: Info = { summary: null, poster_path: null, year: null, tmdb_id: null }

const WHOLE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const TENTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

type SheetProps = {
  /** The film being edited; undefined = adding a new one. */
  movie?: Movie
  userId: string
  others: [string, string][]
  addedBy?: string
  onClose: () => void
}

/** Drawer with the form for adding a film, or for editing and rating one. */
function MovieSheet({ movie, userId, others, addedBy, onClose }: SheetProps) {
  const mine = movie?.ratings[userId]
  const [title, setTitle] = useState(movie?.title ?? '')
  // The rating is picked as a whole number with one tap; the decimal is an
  // extra row that only shows when asked for (or when the rating has one).
  const mineTenths = mine == null ? null : Math.round(mine * 10)
  const [whole, setWhole] = useState<number | null>(
    mineTenths === null ? null : Math.floor(mineTenths / 10),
  )
  const [tenth, setTenth] = useState(mineTenths === null ? 0 : mineTenths % 10)
  const [decimals, setDecimals] = useState(tenth > 0)
  const rating = whole === null ? null : whole === 10 ? 10 : (whole * 10 + tenth) / 10
  const [kind, setKind] = useState<MovieKind>(movie?.kind ?? 'movie')
  const [place, setPlace] = useState<string | null>(movie?.watched_on ?? null)
  const [description, setDescription] = useState(movie?.description ?? '')
  // What TMDB knows about it (summary, poster, year), set by picking a suggestion.
  const [info, setInfo] = useState<Info>({
    summary: movie?.summary ?? null,
    poster_path: movie?.poster_path ?? null,
    year: movie?.year ?? null,
    tmdb_id: movie?.tmdb_id ?? null,
  })
  // The title being looked up in TMDB; null = not looking (nothing typed yet,
  // or a suggestion was just picked).
  const [lookup, setLookup] = useState<string | null>(null)
  const [found, setFound] = useState<{ query: string; matches: Match[] } | null>(null)
  const lookupQuery = lookup?.trim() ?? ''
  const suggestions = lookupQuery.length >= 2 && found?.query === lookupQuery ? found.matches : null

  useEffect(() => {
    if (lookupQuery.length < 2) return
    let stale = false
    // Wait for a pause in the typing before asking.
    const timer = window.setTimeout(async () => {
      try {
        const matches = await searchTmdb(lookupQuery)
        if (!stale) setFound({ query: lookupQuery, matches })
      } catch {
        // Offline or the lookup is down: the film can still be added by hand.
      }
    }, 350)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [lookupQuery])

  function pick(match: Match) {
    setTitle(match.title)
    setKind(match.kind)
    setInfo({
      summary: match.summary,
      poster_path: match.poster_path,
      year: match.year,
      tmdb_id: match.tmdb_id,
    })
    setLookup(null)
  }

  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    // Someone else's film can be edited without rating it yet; otherwise a
    // rating is required.
    if (rating === null && (!movie || mine != null)) {
      setError('Vælg en bedømmelse fra 1 til 10.')
      return
    }
    const details = { title, description, kind, watched_on: place, ...info }
    if (!movie) {
      addMovie(details, rating!)
    } else {
      updateMovie(movie.id, details)
      if (rating !== null && rating !== mine) rateMovie(movie.id, rating)
    }
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-sheet-title"
        onSubmit={submit}
      >
        <h2 id="movie-sheet-title">{movie ? 'Film eller serie' : 'Tilføj film eller serie'}</h2>

        <label>
          Titel
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setLookup(e.target.value)
            }}
            maxLength={200}
            autoCapitalize="sentences"
            autoComplete="off"
            autoFocus={!movie}
            required
          />
        </label>

        {suggestions && suggestions.length > 0 && (
          <ul className="suggestions" aria-label="Forslag fra TMDB">
            {suggestions.map((match) => (
              <li key={`${match.kind}-${match.tmdb_id}`}>
                <button type="button" onClick={() => pick(match)}>
                  {match.poster_path ? (
                    <img className="poster small" src={posterUrl(match.poster_path, 'w92')} alt="" />
                  ) : (
                    <span className="poster small" />
                  )}
                  <span>
                    <b>{match.title}</b>
                    <small>{[kindLabel(match.kind), match.year].filter(Boolean).join(' · ')}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {suggestions?.length === 0 && (
          <p className="hint">Ingen forslag fra TMDB. Du kan stadig tilføje titlen.</p>
        )}
        {!suggestions && info.tmdb_id !== null && (
          <div className="match">
            {info.poster_path && <img className="poster" src={posterUrl(info.poster_path)} alt="" />}
            <div>
              <p className="hint">{info.summary ?? 'TMDB har intet resumé af denne titel.'}</p>
              <button type="button" className="link more" onClick={() => setInfo(NO_INFO)}>
                Fjern resumé og plakat
              </button>
            </div>
          </div>
        )}
        {movie && info.tmdb_id === null && lookup === null && (
          <button type="button" className="link more" onClick={() => setLookup(title)}>
            Find resumé og plakat
          </button>
        )}

        <div className="field">
          <span>
            Din bedømmelse{rating !== null && <b className="rating-value"> {formatRating(rating)}</b>}
          </span>
          <div className="rating-row" role="group" aria-label="Din bedømmelse fra 1 til 10">
            {WHOLE.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={whole === n}
                onClick={() => {
                  setWhole(n)
                  setError(null)
                }}
              >
                {n}
              </button>
            ))}
          </div>
          {decimals ? (
            <div className="rating-row decimals" role="group" aria-label="Decimal">
              {TENTHS.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={whole !== null && whole < 10 && tenth === t}
                  disabled={whole === null || whole === 10}
                  onClick={() => setTenth(t)}
                >
                  ,{t}
                </button>
              ))}
            </div>
          ) : (
            <button type="button" className="link more" onClick={() => setDecimals(true)}>
              Tilføj decimal
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        {movie &&
          others.map(([id, name]) => (
            <p key={id} className="hint">
              {movie.ratings[id] == null
                ? `${name} har ikke bedømt den endnu.`
                : `${name} gav ${formatRating(movie.ratings[id])}.`}
            </p>
          ))}

        <div className="tabs" role="group" aria-label="Type">
          <button type="button" aria-pressed={kind === 'movie'} onClick={() => setKind('movie')}>
            Film
          </button>
          <button type="button" aria-pressed={kind === 'series'} onClick={() => setKind('series')}>
            Serie
          </button>
        </div>

        <label>
          Hvor så I den? (valgfrit)
          <button type="button" className="field-button" onClick={() => setPicking(true)}>
            <span className={place ? '' : 'placeholder'}>{placeLabel(place) ?? 'Vælg'}</span>
            <ChevronIcon />
          </button>
        </label>

        <label>
          Hvad synes I? (valgfrit)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={3}
            autoCapitalize="sentences"
          />
        </label>

        {movie && addedBy && (
          <p className="hint">
            Tilføjet af {addedBy}{' '}
            {new Date(movie.added_at).toLocaleDateString('da-DK', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            .
          </p>
        )}

        <button type="submit" disabled={!title.trim()}>
          {movie ? 'Gem' : 'Tilføj'}
        </button>
        <div className="drawer-actions">
          <button type="button" className="link" onClick={onClose}>
            Annuller
          </button>
          {movie && (
            <button
              type="button"
              className="link danger"
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true)
                removeMovie(movie.id)
                onClose()
              }}
            >
              {confirmDelete ? 'Tryk igen for at slette' : 'Slet'}
            </button>
          )}
        </div>
      </form>

      {picking && (
        <div
          className="sheet-backdrop"
          onClick={(e) => {
            // Don't let the tap fall through to the form's backdrop as well.
            e.stopPropagation()
            if (e.target === e.currentTarget) setPicking(false)
          }}
        >
          <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="place-title">
            <h2 id="place-title">Hvor så I den?</h2>
            <ul className="options">
              {[{ id: null, label: 'Ikke angivet' }, ...PLACES].map((option) => (
                <li key={option.id ?? 'none'}>
                  <button
                    type="button"
                    aria-pressed={place === option.id}
                    onClick={() => {
                      setPlace(option.id)
                      setPicking(false)
                    }}
                  >
                    {option.label}
                    {place === option.id && <span aria-hidden="true">✓</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

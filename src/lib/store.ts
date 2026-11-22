// The store for the shopping list and the film list.
//
// Offline-first: the lists are kept in localStorage and shown immediately, and
// every change is applied locally at once and put in a queue. The queue is
// sent in order whenever there is a connection, so adding or ticking off items
// in a shop without signal works and syncs later. Realtime pushes the other
// person's changes in while the app is open.

import type { RealtimeChannel } from '@supabase/supabase-js'
import { notifyItemsAdded, notifyMoviesAdded } from './push'
import { supabase } from './supabase'

export type Item = {
  id: string
  text: string
  added_by: string | null
  added_at: string
  bought_at: string | null
  bought_by: string | null
}

export type MovieKind = 'movie' | 'series'

/** A row in majador.movies. */
export type MovieRow = {
  id: string
  title: string
  description: string | null
  kind: MovieKind
  watched_on: string | null
  // From TMDB, all optional: what it is about, its poster, year and TMDB id.
  // `description` above is the household's own opinion.
  summary: string | null
  poster_path: string | null
  year: number | null
  tmdb_id: number | null
  added_by: string | null
  added_at: string
}

/** A film as the app shows it: the row plus everyone's rating (user id -> 1-10). */
export type Movie = MovieRow & { ratings: Record<string, number> }

export type MovieDetails = Omit<MovieRow, 'id' | 'added_by' | 'added_at'>

/** Where something was watched. The ids are what the database stores. */
export const PLACES = [
  { id: 'netflix', label: 'Netflix' },
  { id: 'sky', label: 'Sky' },
  { id: 'hbo', label: 'HBO' },
  { id: 'disney', label: 'Disney+' },
  { id: 'dr', label: 'DR' },
  { id: 'viaplay', label: 'Viaplay' },
  { id: 'tv2', label: 'TV 2' },
  { id: 'cinema', label: 'Biografen' },
  { id: 'other', label: 'Andet' },
] as const

type Op =
  // notify: a newly added item (the other person gets a notification once it
  // is saved), as opposed to a deleted item being put back by Undo.
  | { kind: 'insert'; row: Item; notify?: boolean }
  | { kind: 'update'; id: string; patch: Partial<Item> }
  | { kind: 'delete'; id: string }
  | { kind: 'movie-insert'; row: MovieRow; notify?: boolean }
  | { kind: 'movie-update'; id: string; patch: Partial<MovieDetails> }
  | { kind: 'movie-delete'; id: string }
  | { kind: 'rate'; movie_id: string; user_id: string; rating: number }

export type SyncStatus = 'synced' | 'syncing' | 'offline'

export type Snapshot = {
  items: Item[]
  movies: Movie[]
  members: Record<string, string> // user id -> display name
  status: SyncStatus
  pending: number
  error: string | null
}

type Data = { items: Item[]; movies: Movie[] }

const ITEMS_KEY = 'majador-items'
const MOVIES_KEY = 'majador-movies'
const QUEUE_KEY = 'majador-queue'
const MEMBERS_KEY = 'majador-members'

let data: Data = { items: [], movies: [] }
let queue: Op[] = []
let members: Record<string, string> = {}
let status: SyncStatus = 'syncing'
let error: string | null = null
let userId: string | null = null
let channel: RealtimeChannel | null = null
let syncing = false
let syncAgain = false

let snapshot: Snapshot = { ...data, members, status, pending: 0, error }
const listeners = new Set<() => void>()

function emit() {
  snapshot = { ...data, members, status, pending: queue.length, error }
  listeners.forEach((l) => l())
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): Snapshot {
  return snapshot
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the app still works, just without the cache.
  }
}

function persist() {
  save(ITEMS_KEY, data.items)
  save(MOVIES_KEY, data.movies)
  save(QUEUE_KEY, queue)
}

function mapMovie(d: Data, id: string, change: (m: Movie) => Movie): Data {
  return { ...d, movies: d.movies.map((m) => (m.id === id ? change(m) : m)) }
}

function applyOp(d: Data, op: Op): Data {
  switch (op.kind) {
    case 'insert':
      return d.items.some((i) => i.id === op.row.id) ? d : { ...d, items: [...d.items, op.row] }
    case 'update':
      return { ...d, items: d.items.map((i) => (i.id === op.id ? { ...i, ...op.patch } : i)) }
    case 'delete':
      return { ...d, items: d.items.filter((i) => i.id !== op.id) }
    case 'movie-insert':
      return d.movies.some((m) => m.id === op.row.id)
        ? d
        : { ...d, movies: [...d.movies, { ...op.row, ratings: {} }] }
    case 'movie-update':
      return mapMovie(d, op.id, (m) => ({ ...m, ...op.patch }))
    case 'movie-delete':
      return { ...d, movies: d.movies.filter((m) => m.id !== op.id) }
    case 'rate':
      return mapMovie(d, op.movie_id, (m) => ({
        ...m,
        ratings: { ...m.ratings, [op.user_id]: op.rating },
      }))
  }
}

/** The shopping item or film an op is about. */
function targetId(op: Op): string {
  if (op.kind === 'insert' || op.kind === 'movie-insert') return op.row.id
  return op.kind === 'rate' ? op.movie_id : op.id
}

/**
 * True while a local change to this item or film is still waiting to be sent.
 * Ours will win when it goes out, so incoming changes must not flicker it
 * back to the old state.
 */
function hasPending(id: string): boolean {
  return queue.some((op) => targetId(op) === id)
}

function enqueue(...ops: Op[]) {
  data = ops.reduce(applyOp, data)
  queue = [...queue, ...ops]
  persist()
  emit()
  void sync()
}

// ── Sending the queue ───────────────────────────────────────────────────────

type OpResult = 'ok' | 'retry' | 'rejected'

function request(op: Op) {
  switch (op.kind) {
    case 'insert':
      return supabase.from('shopping_items').insert(op.row)
    case 'update':
      return supabase.from('shopping_items').update(op.patch).eq('id', op.id)
    case 'delete':
      return supabase.from('shopping_items').delete().eq('id', op.id)
    case 'movie-insert':
      return supabase.from('movies').insert(op.row)
    case 'movie-update':
      return supabase.from('movies').update(op.patch).eq('id', op.id)
    case 'movie-delete':
      return supabase.from('movies').delete().eq('id', op.id)
    case 'rate':
      return supabase.from('movie_ratings').upsert(
        {
          movie_id: op.movie_id,
          user_id: op.user_id,
          rating: op.rating,
          rated_at: new Date().toISOString(),
        },
        { onConflict: 'movie_id,user_id' },
      )
  }
}

async function send(op: Op): Promise<OpResult> {
  const { error: e } = await request(op)
  if (!e) return 'ok'
  // No error code = the request never reached the database (no signal).
  // PGRST3xx = the login token needs refreshing. Both: keep the op, try later.
  if (!e.code || e.code.startsWith('PGRST3')) return 'retry'
  // Duplicate key on insert: an earlier attempt got through but its reply was
  // lost. The row is there, which is what we wanted.
  if ((op.kind === 'insert' || op.kind === 'movie-insert') && e.code === '23505') return 'ok'
  // Rating a film the other person deleted in the meantime: nothing to do.
  if (op.kind === 'rate' && e.code === '23503') return 'ok'
  error = e.message
  return 'rejected'
}

async function flush(): Promise<boolean> {
  // New items and films saved in this round. They are announced together
  // afterwards, so a whole list typed without signal becomes one
  // notification, not ten.
  const addedItems: string[] = []
  const addedMovies: string[] = []
  let done = true
  while (queue.length > 0) {
    const op = queue[0]
    const result = await send(op)
    if (result === 'retry') {
      done = false
      break
    }
    if (result === 'ok' && op.kind === 'insert' && op.notify) addedItems.push(op.row.id)
    if (result === 'ok' && op.kind === 'movie-insert' && op.notify) addedMovies.push(op.row.id)
    // 'rejected' ops are dropped: retrying a change the database refuses
    // would block every change queued behind it.
    queue = queue.slice(1)
    save(QUEUE_KEY, queue)
  }
  // A film's rating is queued right behind the film itself. If the connection
  // drops exactly between the two, the notification goes out without the
  // rating (the server then shows the title alone).
  if (addedItems.length > 0) void notifyItemsAdded(addedItems)
  if (addedMovies.length > 0) void notifyMoviesAdded(addedMovies)
  return done
}

type ServerMovie = MovieRow & { movie_ratings: { user_id: string; rating: number }[] }

async function fetchAll(): Promise<boolean> {
  const [shopping, films] = await Promise.all([
    supabase
      .from('shopping_items')
      .select('id, text, added_by, added_at, bought_at, bought_by')
      .order('added_at', { ascending: false })
      .limit(1000),
    supabase
      .from('movies')
      .select(
        'id, title, description, kind, watched_on, summary, poster_path, year, tmdb_id, added_by, added_at, movie_ratings(user_id, rating)',
      )
      .order('added_at', { ascending: false })
      .limit(1000),
  ])
  for (const e of [shopping.error, films.error]) {
    if (e?.code && !e.code.startsWith('PGRST3')) error = e.message
  }
  const server: Data = {
    items: shopping.error ? data.items : (shopping.data as Item[]),
    movies: films.error
      ? data.movies
      : (films.data as unknown as ServerMovie[]).map(({ movie_ratings, ...row }) => ({
          ...row,
          ratings: Object.fromEntries(movie_ratings.map((r) => [r.user_id, Number(r.rating)])),
        })),
  }
  // Changes made while the request was in flight are still in the queue;
  // put them back on top of the server's version.
  data = queue.reduce(applyOp, server)
  persist()
  return !shopping.error && !films.error
}

async function fetchMembers() {
  const { data: rows } = await supabase.from('members').select('user_id, display_name')
  if (!rows) return
  members = Object.fromEntries(rows.map((m) => [m.user_id, m.display_name]))
  save(MEMBERS_KEY, members)
  emit()
}

export async function sync(): Promise<void> {
  if (!userId) return
  if (syncing) {
    syncAgain = true
    return
  }
  syncing = true
  status = 'syncing'
  error = null
  emit()
  do {
    syncAgain = false
    const ok = (await flush()) && (await fetchAll())
    status = ok ? 'synced' : 'offline'
  } while (syncAgain && status === 'synced')
  syncing = false
  emit()
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

function onForeground() {
  if (document.visibilityState === 'visible') void sync()
}

export function startStore(currentUserId: string) {
  if (userId === currentUserId) return
  userId = currentUserId
  data = { items: load<Item[]>(ITEMS_KEY, []), movies: load<Movie[]>(MOVIES_KEY, []) }
  queue = load<Op[]>(QUEUE_KEY, [])
  members = load<Record<string, string>>(MEMBERS_KEY, {})
  emit()

  window.addEventListener('online', onForeground)
  document.addEventListener('visibilitychange', onForeground)

  channel = supabase
    .channel('majador-shopping')
    .on(
      'postgres_changes',
      { event: '*', schema: 'majador', table: 'shopping_items' },
      (payload) => {
        const id = ((payload.new as Item | undefined)?.id ?? (payload.old as Item).id) as string
        if (hasPending(id)) return
        if (payload.eventType === 'DELETE') {
          data = { ...data, items: data.items.filter((i) => i.id !== id) }
        } else {
          const row = payload.new as Item
          data = {
            ...data,
            items: data.items.some((i) => i.id === id)
              ? data.items.map((i) => (i.id === id ? row : i))
              : [...data.items, row],
          }
        }
        persist()
        emit()
      },
    )
    .on('postgres_changes', { event: '*', schema: 'majador', table: 'movies' }, (payload) => {
      const id = ((payload.new as MovieRow | undefined)?.id ??
        (payload.old as MovieRow).id) as string
      if (hasPending(id)) return
      if (payload.eventType === 'DELETE') {
        data = { ...data, movies: data.movies.filter((m) => m.id !== id) }
      } else {
        const row = payload.new as MovieRow
        data = data.movies.some((m) => m.id === id)
          ? mapMovie(data, id, (m) => ({ ...m, ...row }))
          : { ...data, movies: [...data.movies, { ...row, ratings: {} }] }
      }
      persist()
      emit()
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'majador', table: 'movie_ratings' },
      (payload) => {
        const gone = payload.eventType === 'DELETE'
        const r = (gone ? payload.old : payload.new) as {
          movie_id: string
          user_id: string
          rating: number
        }
        if (hasPending(r.movie_id)) return
        data = mapMovie(data, r.movie_id, (m) => {
          const ratings = { ...m.ratings }
          if (gone) delete ratings[r.user_id]
          else ratings[r.user_id] = Number(r.rating)
          return { ...m, ratings }
        })
        persist()
        emit()
      },
    )
    .subscribe((state) => {
      // (Re)connected: catch up on anything missed while disconnected.
      if (state === 'SUBSCRIBED') void sync()
    })

  void fetchMembers()
  void sync()
}

/** Called on logout: forget everything so the next login starts clean. */
export function stopStore() {
  if (!userId) return
  userId = null
  window.removeEventListener('online', onForeground)
  document.removeEventListener('visibilitychange', onForeground)
  if (channel) void supabase.removeChannel(channel)
  channel = null
  data = { items: [], movies: [] }
  queue = []
  members = {}
  for (const key of [ITEMS_KEY, MOVIES_KEY, QUEUE_KEY, MEMBERS_KEY]) {
    try {
      localStorage.removeItem(key)
    } catch {
      // nothing to clear
    }
  }
  emit()
}

// ── Shopping actions ────────────────────────────────────────────────────────

export function addItem(text: string) {
  const trimmed = text.trim().slice(0, 200)
  if (!trimmed || !userId) return
  enqueue({
    kind: 'insert',
    notify: true,
    row: {
      id: crypto.randomUUID(),
      text: trimmed,
      added_by: userId,
      added_at: new Date().toISOString(),
      bought_at: null,
      bought_by: null,
    },
  })
}

export function setBought(id: string, bought: boolean) {
  enqueue({
    kind: 'update',
    id,
    patch: bought
      ? { bought_at: new Date().toISOString(), bought_by: userId }
      : { bought_at: null, bought_by: null },
  })
}

export function removeItem(id: string) {
  enqueue({ kind: 'delete', id })
}

/** Puts a deleted item back exactly as it was (used by Undo). */
export function restoreItem(item: Item) {
  enqueue({ kind: 'insert', row: item })
}

// ── Film actions ────────────────────────────────────────────────────────────

function cleanDetails(d: MovieDetails): MovieDetails {
  return {
    title: d.title.trim().slice(0, 200),
    description: d.description?.trim().slice(0, 1000) || null,
    kind: d.kind,
    watched_on: d.watched_on,
    summary: d.summary?.trim().slice(0, 2000) || null,
    poster_path: d.poster_path ?? null,
    year: d.year ?? null,
    tmdb_id: d.tmdb_id ?? null,
  }
}

/** Adds a film or series together with the rating of the person adding it. */
export function addMovie(details: MovieDetails, rating: number) {
  const clean = cleanDetails(details)
  if (!clean.title || !userId) return
  const id = crypto.randomUUID()
  enqueue(
    {
      kind: 'movie-insert',
      notify: true,
      row: { id, ...clean, added_by: userId, added_at: new Date().toISOString() },
    },
    { kind: 'rate', movie_id: id, user_id: userId, rating },
  )
}

/** Saves edited details; only the fields that actually changed are sent. */
export function updateMovie(id: string, details: MovieDetails) {
  const current = data.movies.find((m) => m.id === id)
  const clean = cleanDetails(details)
  if (!current || !clean.title) return
  const patch: Partial<MovieDetails> = {}
  for (const key of Object.keys(clean) as (keyof MovieDetails)[]) {
    // `?? null`: films cached before a column existed have no such field.
    if (clean[key] !== (current[key] ?? null)) Object.assign(patch, { [key]: clean[key] })
  }
  if (Object.keys(patch).length > 0) enqueue({ kind: 'movie-update', id, patch })
}

/** Sets the logged-in person's own rating (1-10, one decimal). */
export function rateMovie(id: string, rating: number) {
  if (!userId) return
  enqueue({ kind: 'rate', movie_id: id, user_id: userId, rating })
}

export function removeMovie(id: string) {
  enqueue({ kind: 'movie-delete', id })
}

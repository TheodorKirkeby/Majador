// The shopping list store.
//
// Offline-first: the list is kept in localStorage and shown immediately, and
// every change is applied locally at once and put in a queue. The queue is
// sent in order whenever there is a connection, so adding or ticking off items
// in a shop without signal works and syncs later. Realtime pushes the other
// person's changes in while the app is open.

import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Item = {
  id: string
  text: string
  added_by: string | null
  added_at: string
  bought_at: string | null
  bought_by: string | null
}

type Op =
  | { kind: 'insert'; row: Item }
  | { kind: 'update'; id: string; patch: Partial<Item> }
  | { kind: 'delete'; id: string }

export type SyncStatus = 'synced' | 'syncing' | 'offline'

export type Snapshot = {
  items: Item[]
  members: Record<string, string> // user id -> display name
  status: SyncStatus
  pending: number
  error: string | null
}

const ITEMS_KEY = 'majador-items'
const QUEUE_KEY = 'majador-queue'
const MEMBERS_KEY = 'majador-members'

let items: Item[] = []
let queue: Op[] = []
let members: Record<string, string> = {}
let status: SyncStatus = 'syncing'
let error: string | null = null
let userId: string | null = null
let channel: RealtimeChannel | null = null
let syncing = false
let syncAgain = false

let snapshot: Snapshot = { items, members, status, pending: 0, error }
const listeners = new Set<() => void>()

function emit() {
  snapshot = { items, members, status, pending: queue.length, error }
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
  save(ITEMS_KEY, items)
  save(QUEUE_KEY, queue)
}

function applyOp(list: Item[], op: Op): Item[] {
  switch (op.kind) {
    case 'insert':
      return list.some((i) => i.id === op.row.id) ? list : [...list, op.row]
    case 'update':
      return list.map((i) => (i.id === op.id ? { ...i, ...op.patch } : i))
    case 'delete':
      return list.filter((i) => i.id !== op.id)
  }
}

function enqueue(op: Op) {
  items = applyOp(items, op)
  queue = [...queue, op]
  persist()
  emit()
  void sync()
}

// ── Sending the queue ───────────────────────────────────────────────────────

type OpResult = 'ok' | 'retry' | 'rejected'

async function send(op: Op): Promise<OpResult> {
  const table = supabase.from('shopping_items')
  const { error: e } =
    op.kind === 'insert'
      ? await table.insert(op.row)
      : op.kind === 'update'
        ? await table.update(op.patch).eq('id', op.id)
        : await table.delete().eq('id', op.id)

  if (!e) return 'ok'
  // No error code = the request never reached the database (no signal).
  // PGRST3xx = the login token needs refreshing. Both: keep the op, try later.
  if (!e.code || e.code.startsWith('PGRST3')) return 'retry'
  // Duplicate key on insert: an earlier attempt got through but its reply was
  // lost. The row is there, which is what we wanted.
  if (op.kind === 'insert' && e.code === '23505') return 'ok'
  error = e.message
  return 'rejected'
}

async function flush(): Promise<boolean> {
  while (queue.length > 0) {
    const result = await send(queue[0])
    if (result === 'retry') return false
    // 'rejected' ops are dropped: retrying a change the database refuses
    // would block every change queued behind it.
    queue = queue.slice(1)
    save(QUEUE_KEY, queue)
  }
  return true
}

async function fetchAll(): Promise<boolean> {
  const { data, error: e } = await supabase
    .from('shopping_items')
    .select('id, text, added_by, added_at, bought_at, bought_by')
    .order('added_at', { ascending: false })
    .limit(1000)
  if (e) {
    if (e.code && !e.code.startsWith('PGRST3')) error = e.message
    return false
  }
  // Changes made while the request was in flight are still in the queue;
  // put them back on top of the server's version.
  items = queue.reduce(applyOp, data as Item[])
  persist()
  return true
}

async function fetchMembers() {
  const { data } = await supabase.from('members').select('user_id, display_name')
  if (!data) return
  members = Object.fromEntries(data.map((m) => [m.user_id, m.display_name]))
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
  items = load<Item[]>(ITEMS_KEY, [])
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
        // A local change to the same item is still waiting to be sent; ours
        // will win when it goes out, so don't flicker back to the old state.
        if (queue.some((op) => (op.kind === 'insert' ? op.row.id : op.id) === id)) return
        if (payload.eventType === 'DELETE') {
          items = items.filter((i) => i.id !== id)
        } else {
          const row = payload.new as Item
          items = items.some((i) => i.id === id)
            ? items.map((i) => (i.id === id ? row : i))
            : [...items, row]
        }
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
  items = []
  queue = []
  members = {}
  for (const key of [ITEMS_KEY, QUEUE_KEY, MEMBERS_KEY]) {
    try {
      localStorage.removeItem(key)
    } catch {
      // nothing to clear
    }
  }
  emit()
}

// ── Actions ─────────────────────────────────────────────────────────────────

export function addItem(text: string) {
  const trimmed = text.trim().slice(0, 200)
  if (!trimmed || !userId) return
  enqueue({
    kind: 'insert',
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

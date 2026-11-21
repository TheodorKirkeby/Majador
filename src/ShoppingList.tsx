import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import SwipeRow from './SwipeRow'
import {
  addItem,
  getSnapshot,
  removeItem,
  restoreItem,
  setBought,
  subscribe,
  type Item,
} from './lib/store'

const DAY = 24 * 60 * 60 * 1000

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** "today", "yesterday", "5 days", "3 weeks", then the date. */
function age(iso: string, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days`
  if (days < 60) return `${Math.floor(days / 7)} weeks`
  return shortDate(iso, now)
}

function shortDate(iso: string, now: Date): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

type Undo = { message: string; run: () => void }

export default function ShoppingList({ view }: { view: 'list' | 'bought' }) {
  const { items, members, status, pending } = useSyncExternalStore(subscribe, getSnapshot)
  const [text, setText] = useState('')
  const [undo, setUndo] = useState<Undo | null>(null)
  const undoTimer = useRef<number | undefined>(undefined)
  // "today"/"3 days" labels are relative to this; refreshed whenever the app
  // comes back to the foreground so they are right after midnight.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => document.visibilityState === 'visible' && setNow(new Date())
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])

  const active = useMemo(
    () =>
      items.filter((i) => !i.bought_at).sort((a, b) => b.added_at.localeCompare(a.added_at)),
    [items],
  )
  const bought = useMemo(
    () =>
      items
        .filter((i) => i.bought_at)
        .sort((a, b) => b.bought_at!.localeCompare(a.bought_at!)),
    [items],
  )

  // Number on the app icon = items still to buy (where the device supports it).
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (active.length > 0) nav.setAppBadge?.(active.length).catch(() => {})
    else nav.clearAppBadge?.().catch(() => {})
  }, [active.length])

  useEffect(() => () => window.clearTimeout(undoTimer.current), [])

  function offerUndo(next: Undo) {
    window.clearTimeout(undoTimer.current)
    setUndo(next)
    undoTimer.current = window.setTimeout(() => setUndo(null), 6000)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    addItem(text)
    setText('')
  }

  function markBought(item: Item) {
    setBought(item.id, true)
    offerUndo({ message: `Bought: ${item.text}`, run: () => setBought(item.id, false) })
  }

  function moveBack(item: Item) {
    setBought(item.id, false)
    offerUndo({ message: `Back on the list: ${item.text}`, run: () => setBought(item.id, true) })
  }

  function remove(item: Item) {
    removeItem(item.id)
    offerUndo({ message: `Deleted: ${item.text}`, run: () => restoreItem(item) })
  }

  const who = (id: string | null) => (id && members[id]) || null
  const shown = view === 'list' ? active : bought

  return (
    <>
      {status === 'offline' && (
        <p className="banner">
          No connection.{' '}
          {pending > 0
            ? `${pending} change${pending === 1 ? '' : 's'} will be sent when you're back online.`
            : 'Showing the last saved list.'}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="empty">
          {view === 'list'
            ? 'Nothing on the list. Add the first item below.'
            : 'Nothing bought yet. Swipe an item on the list to mark it as bought.'}
        </p>
      ) : (
        <ul className="items">
          {shown.map((item) =>
            view === 'list' ? (
              <SwipeRow
                key={item.id}
                right={{ label: 'Bought', tone: 'ok', onCommit: () => markBought(item) }}
                left={{ label: 'Delete', tone: 'danger', onCommit: () => remove(item) }}
              >
                <span className="item-text">{item.text}</span>
                <span className="item-meta">
                  <span>{age(item.added_at, now)}</span>
                  {who(item.added_by) && <span>{who(item.added_by)}</span>}
                </span>
              </SwipeRow>
            ) : (
              <SwipeRow
                key={item.id}
                right={{ label: 'Back to list', tone: 'neutral', onCommit: () => moveBack(item) }}
                left={{ label: 'Delete', tone: 'danger', onCommit: () => remove(item) }}
              >
                <span className="item-text bought">{item.text}</span>
                <span className="item-meta">
                  <span>{shortDate(item.bought_at!, now)}</span>
                  {who(item.bought_by) && <span>{who(item.bought_by)}</span>}
                </span>
              </SwipeRow>
            ),
          )}
        </ul>
      )}

      <div className="dock">
        {undo && (
          <div className="toast" role="status">
            <span>{undo.message}</span>
            <button
              className="link"
              onClick={() => {
                undo.run()
                window.clearTimeout(undoTimer.current)
                setUndo(null)
              }}
            >
              Undo
            </button>
          </div>
        )}
        {view === 'list' && (
          <form className="add" onSubmit={submit}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add an item"
              aria-label="Add an item"
              maxLength={200}
              enterKeyHint="done"
              autoCapitalize="sentences"
              autoComplete="off"
            />
            <button type="submit" disabled={!text.trim()} aria-label="Add">
              +
            </button>
          </form>
        )}
      </div>
    </>
  )
}

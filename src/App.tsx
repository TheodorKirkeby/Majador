import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import InstallPrompt from './InstallPrompt'
import Settings from './Settings'
import ShoppingList from './ShoppingList'
import { getSnapshot, startStore, stopStore, subscribe } from './lib/store'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (loading) return null
  if (!session) {
    return (
      <main className="app">
        <header className="brand">
          <h1>
            Maja<span>Dor</span>
          </h1>
        </header>
        <Login />
      </main>
    )
  }
  return <Home session={session} />
}

type View = 'list' | 'bought' | 'settings'

function Home({ session }: { session: Session }) {
  const [view, setView] = useState<View>('list')
  const { items, error } = useSyncExternalStore(subscribe, getSnapshot)
  const userId = session.user.id

  useEffect(() => {
    startStore(userId)
  }, [userId])

  const toBuy = items.filter((i) => !i.bought_at).length

  return (
    <main className="app">
      <InstallPrompt />
      <header className="brand">
        <h1>
          Maja<span>Dor</span>
        </h1>
        <button
          className="icon-button"
          aria-label={view === 'settings' ? 'Back to the list' : 'Settings'}
          onClick={() => setView(view === 'settings' ? 'list' : 'settings')}
        >
          {view === 'settings' ? <CloseIcon /> : <GearIcon />}
        </button>
      </header>

      {view === 'settings' ? (
        <Settings
          session={session}
          onLogout={async () => {
            stopStore()
            await supabase.auth.signOut()
          }}
        />
      ) : (
        <>
          <nav className="tabs" aria-label="Shopping list">
            <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
              To buy{toBuy > 0 ? ` (${toBuy})` : ''}
            </button>
            <button aria-pressed={view === 'bought'} onClick={() => setView('bought')}>
              Bought
            </button>
          </nav>
          {error && <p className="banner error-banner">Could not sync: {error}</p>}
          <ShoppingList view={view} />
        </>
      )}
    </main>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <form className="card" onSubmit={submit}>
      <label>
        Email
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  )
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function GearIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.8H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.8-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.8H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.1z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg {...iconProps}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

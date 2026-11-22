import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import InstallPrompt from './InstallPrompt'
import Movies from './Movies'
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
          <Brand />
        </header>
        <Login />
      </main>
    )
  }
  return <Home session={session} />
}

function Brand() {
  return (
    <div className="brand-name">
      <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" />
      <h1>
        Maja<span>Dor</span>
      </h1>
    </div>
  )
}

type Page = 'shopping' | 'movies'

function Home({ session }: { session: Session }) {
  const [page, setPage] = useState<Page>('shopping')
  const [shopView, setShopView] = useState<'list' | 'bought'>('list')
  const [settings, setSettings] = useState(false)
  const [searching, setSearching] = useState(false)
  const { items, error } = useSyncExternalStore(subscribe, getSnapshot)
  const userId = session.user.id

  useEffect(() => {
    startStore(userId)
  }, [userId])

  const toBuy = items.filter((i) => !i.bought_at).length

  function go(to: Page) {
    setPage(to)
    setSettings(false)
    setSearching(false)
    window.scrollTo(0, 0)
  }

  return (
    <main className="app">
      <InstallPrompt />
      <header className="brand">
        <Brand />
        <div className="header-actions">
          {page === 'movies' && !settings && (
            <button
              className="icon-button"
              aria-label="Søg i film og serier"
              onClick={() => setSearching(true)}
            >
              <SearchIcon />
            </button>
          )}
          <button
            className="icon-button"
            aria-label={settings ? 'Luk indstillinger' : 'Indstillinger'}
            onClick={() => setSettings(!settings)}
          >
            {settings ? <CloseIcon /> : <GearIcon />}
          </button>
        </div>
      </header>

      {settings ? (
        <Settings
          session={session}
          onLogout={async () => {
            stopStore()
            await supabase.auth.signOut()
          }}
        />
      ) : (
        <>
          {page === 'shopping' && (
            <nav className="tabs" aria-label="Indkøbsliste">
              <button aria-pressed={shopView === 'list'} onClick={() => setShopView('list')}>
                Skal købes{toBuy > 0 ? ` (${toBuy})` : ''}
              </button>
              <button aria-pressed={shopView === 'bought'} onClick={() => setShopView('bought')}>
                Købt
              </button>
            </nav>
          )}
          {error && <p className="banner error-banner">Kunne ikke synkronisere: {error}</p>}
          {page === 'shopping' ? <ShoppingList view={shopView} /> : (
            <Movies
              userId={userId}
              searching={searching}
              onCloseSearch={() => setSearching(false)}
            />
          )}
        </>
      )}

      <nav className="bottom-nav" aria-label="Sider">
        <button
          aria-current={!settings && page === 'shopping' ? 'page' : undefined}
          onClick={() => go('shopping')}
        >
          <CartIcon />
          Indkøb
        </button>
        <button
          aria-current={!settings && page === 'movies' ? 'page' : undefined}
          onClick={() => go('movies')}
        >
          <FilmIcon />
          Film
        </button>
      </nav>
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
    if (error) {
      // Supabase answers in English; the one message people actually hit gets
      // a Danish version.
      setError(
        error.code === 'invalid_credentials'
          ? 'Forkert email eller adgangskode.'
          : `Kunne ikke logge ind: ${error.message}`,
      )
    }
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
        Adgangskode
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
        {busy ? 'Logger ind…' : 'Log ind'}
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

function SearchIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2 3h3l2.7 12.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20.5 7H6" />
    </svg>
  )
}

function FilmIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 3v18M17 3v18M3 12h18M3 7.5h4M3 16.5h4M17 7.5h4M17 16.5h4" />
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

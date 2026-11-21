import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import {
  currentSubscription,
  enablePush,
  isInstalled,
  pushSupported,
  sendTestPush,
} from './lib/push'

// Shell for the feasibility test: install, log in, receive a push. The
// shopping list replaces the checklist below once all three work on both phones.

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

  return (
    <main className="app">
      <header className="brand">
        <h1>
          Maja<span>Dor</span>
        </h1>
      </header>
      {loading ? null : session ? <SetupCheck session={session} /> : <Login />}
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

function SetupCheck({ session }: { session: Session }) {
  const [memberName, setMemberName] = useState<string | null | undefined>(undefined)
  const [subscribed, setSubscribed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('members')
      .select('display_name')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setMemberName(data?.display_name ?? null))
    currentSubscription().then((sub) => setSubscribed(sub !== null))
  }, [session.user.id])

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setMessage(null)
    try {
      setMessage(await action())
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const isMember = typeof memberName === 'string'

  return (
    <>
      <section className="card">
        <h2>Setup check</h2>
        <ul className="checks">
          <Check ok={isInstalled} label="Opened from the home screen" />
          <Check ok label={`Logged in as ${session.user.email}`} />
          <Check
            ok={isMember}
            label={
              memberName === undefined
                ? 'Checking household…'
                : isMember
                  ? `Household member: ${memberName}`
                  : 'Not in the household yet'
            }
          />
          <Check
            ok={subscribed}
            label={
              !pushSupported
                ? 'Notifications are not available here'
                : subscribed
                  ? 'Notifications are on for this device'
                  : 'Notifications are off for this device'
            }
          />
        </ul>

        {!isInstalled && (
          <p className="hint">
            Add MajaDor to the home screen first (iPhone: Share → Add to Home Screen; Android:
            menu → Install app), then open it from the icon.
          </p>
        )}

        {pushSupported && !subscribed && (
          <button
            disabled={busy || !isMember}
            onClick={() =>
              run(async () => {
                await enablePush(session.user.id)
                setSubscribed(true)
                return 'Notifications are on.'
              })
            }
          >
            Turn on notifications
          </button>
        )}

        {subscribed && (
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await sendTestPush()
                return `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}${
                  r.failed ? `, ${r.failed} failed` : ''
                }.`
              })
            }
          >
            Send test notification to everyone
          </button>
        )}

        {message && <p className="hint">{message}</p>}
      </section>

      <button className="link" onClick={() => supabase.auth.signOut()}>
        Log out
      </button>
    </>
  )
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={ok ? 'ok' : 'todo'}>
      <span aria-hidden="true">{ok ? '✓' : '○'}</span>
      {label}
    </li>
  )
}

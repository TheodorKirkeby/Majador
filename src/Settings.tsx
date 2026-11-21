import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  currentSubscription,
  enablePush,
  isInstalled,
  pushSupported,
  sendTestPush,
} from './lib/push'
import { getSnapshot, subscribe } from './lib/store'

type Props = { session: Session; onLogout: () => void }

/** Device status, notifications and logout. */
export default function Settings({ session, onLogout }: Props) {
  const { members } = useSyncExternalStore(subscribe, getSnapshot)
  const [subscribed, setSubscribed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    currentSubscription().then((sub) => setSubscribed(sub !== null))
  }, [])

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

  const memberName = members[session.user.id]

  return (
    <>
      <section className="card">
        <h2>This device</h2>
        <ul className="checks">
          <Check ok={isInstalled} label="Opened from the home screen" />
          <Check ok label={`Logged in as ${session.user.email}`} />
          <Check
            ok={Boolean(memberName)}
            label={memberName ? `Household member: ${memberName}` : 'Not in the household yet'}
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

        {pushSupported && !subscribed && (
          <button
            disabled={busy || !memberName}
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

      <button className="link" onClick={onLogout}>
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

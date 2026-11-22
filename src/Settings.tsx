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
        <h2>Denne enhed</h2>
        <ul className="checks">
          <Check ok={isInstalled} label="Åbnet fra hjemmeskærmen" />
          <Check ok label={`Logget ind som ${session.user.email}`} />
          <Check
            ok={Boolean(memberName)}
            label={memberName ? `Medlem af husstanden: ${memberName}` : 'Ikke med i husstanden endnu'}
          />
          <Check
            ok={subscribed}
            label={
              !pushSupported
                ? 'Notifikationer er ikke tilgængelige her'
                : subscribed
                  ? 'Notifikationer er slået til på denne enhed'
                  : 'Notifikationer er slået fra på denne enhed'
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
                return 'Notifikationer er slået til.'
              })
            }
          >
            Slå notifikationer til
          </button>
        )}

        {subscribed && (
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await sendTestPush()
                return `Sendt til ${r.sent} ${r.sent === 1 ? 'enhed' : 'enheder'}${
                  r.failed ? `, ${r.failed} fejlede` : ''
                }.`
              })
            }
          >
            Send testnotifikation til alle
          </button>
        )}

        {message && <p className="hint">{message}</p>}
      </section>

      <button className="link" onClick={onLogout}>
        Log ud
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

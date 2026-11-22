import { useState, useSyncExternalStore } from 'react'
import { canPromptInstall, isIos, promptInstall, subscribeInstall } from './lib/install'
import { isInstalled } from './lib/push'

const DISMISSED_KEY = 'majador-install-dismissed'

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/** Popup shown after login while the app still runs in a browser tab. */
export default function InstallPrompt() {
  const canPrompt = useSyncExternalStore(subscribeInstall, canPromptInstall)
  const [closed, setClosed] = useState(wasDismissed)
  const [installed, setInstalled] = useState(false)

  if (isInstalled || closed) return null

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Private mode: it just shows again next time.
    }
    setClosed(true)
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <div className="sheet">
        <img className="sheet-icon" src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" />
        <h2 id="install-title">Installér MajaDor</h2>

        {installed ? (
          <p>Installeret. Luk denne fane, og åbn MajaDor fra din hjemmeskærm.</p>
        ) : canPrompt ? (
          <>
            <p>Læg MajaDor på din hjemmeskærm for at få notifikationer og en app i fuld skærm.</p>
            <button onClick={async () => setInstalled(await promptInstall())}>Installér</button>
          </>
        ) : isIos ? (
          <>
            <p>iPhone installerer kun apps fra Del-menuen. I Safari:</p>
            <ol className="steps">
              <li>
                Tryk på <ShareIcon /> <strong>Del</strong> i værktøjslinjen
              </li>
              <li>
                Rul ned, og tryk på <strong>Føj til hjemmeskærm</strong>
              </li>
              <li>
                Tryk på <strong>Tilføj</strong>, og åbn så MajaDor fra ikonet
              </li>
            </ol>
          </>
        ) : (
          <p>
            Åbn browserens menu, og vælg <strong>Installér app</strong> eller{' '}
            <strong>Føj til startskærm</strong>. Åbn derefter MajaDor fra ikonet.
          </p>
        )}

        <button className="link" onClick={dismiss}>
          {installed ? 'Luk' : 'Ikke nu'}
        </button>
      </div>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg
      className="inline-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  )
}

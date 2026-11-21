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
        <h2 id="install-title">Install MajaDor</h2>

        {installed ? (
          <p>Installed. Close this tab and open MajaDor from your home screen.</p>
        ) : canPrompt ? (
          <>
            <p>Put MajaDor on your home screen to get notifications and a full-screen app.</p>
            <button onClick={async () => setInstalled(await promptInstall())}>Install</button>
          </>
        ) : isIos ? (
          <>
            <p>iPhone only installs apps from the Share menu. In Safari:</p>
            <ol className="steps">
              <li>
                Tap <ShareIcon /> <strong>Share</strong> in the toolbar
              </li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>
              </li>
              <li>
                Tap <strong>Add</strong>, then open MajaDor from the icon
              </li>
            </ol>
          </>
        ) : (
          <p>
            Open your browser's menu and choose <strong>Install app</strong> or{' '}
            <strong>Add to Home screen</strong>, then open MajaDor from the icon.
          </p>
        )}

        <button className="link" onClick={dismiss}>
          {installed ? 'Close' : 'Not now'}
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

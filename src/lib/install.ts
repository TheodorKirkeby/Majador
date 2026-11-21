// Install-to-home-screen support.
//
// Android/desktop Chrome fire `beforeinstallprompt`, which lets a button of
// ours open the real install dialog. iOS has no such API: Safari only installs
// through Share → Add to Home Screen, so there we can only show the steps.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

// Registered at module load (imported from main.tsx) because the event can
// fire before React has mounted.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // keep Chrome's own mini-banner away; we show our popup
  deferred = e as BeforeInstallPromptEvent
  listeners.forEach((l) => l())
})

window.addEventListener('appinstalled', () => {
  deferred = null
  listeners.forEach((l) => l())
})

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** True when the browser will let our button open the install dialog. */
export function canPromptInstall(): boolean {
  return deferred !== null
}

/** Opens the browser's install dialog. Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  await event.prompt()
  const { outcome } = await event.userChoice
  deferred = null // the event can only be used once
  listeners.forEach((l) => l())
  return outcome === 'accepted'
}

export const isIos =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac; touch support tells them apart.
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)

import { supabase } from './supabase'

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushSupported =
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** True when running from the home screen icon rather than a browser tab. */
export const isInstalled =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/**
 * Ask for permission, subscribe this device and store the subscription.
 * Must be called from a tap — iOS only shows the permission prompt on a
 * user gesture, and only when the app runs from the home screen.
 */
export async function enablePush(userId: string): Promise<void> {
  if (!pushSupported) throw new Error('Denne browser understøtter ikke push-notifikationer.')
  if (!vapidPublicKey) throw new Error('VITE_VAPID_PUBLIC_KEY mangler.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifikationer blev ikke tilladt.')

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(vapidPublicKey),
    }))

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw new Error(error.message)
}

/**
 * Tell the rest of the household that these items were added. The server
 * counts them together with anything else added in the last few minutes into
 * one silent notification. Best effort: a failure here must never get in the
 * way of the list itself.
 */
export async function notifyItemsAdded(ids: string[]): Promise<void> {
  try {
    await supabase.functions.invoke('majador-push', { body: { type: 'shopping.added', ids } })
  } catch {
    // No connection or the function is down: the item is saved, the
    // notification is simply skipped.
  }
}

export type PushResult = { sent: number; failed: number; removed: number }

/** Send a test notification to every device registered in the household. */
export async function sendTestPush(): Promise<PushResult> {
  const { data, error } = await supabase.functions.invoke<PushResult>('majador-push', {
    body: { type: 'test' },
  })
  if (error) throw new Error(error.message)
  return data ?? { sent: 0, failed: 0, removed: 0 }
}

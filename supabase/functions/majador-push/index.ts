// majador-push: sends web push notifications to the household's devices.
//
// Edge Function names and secrets are project-wide on the shared Supabase
// project, hence the `majador-` / `MAJADOR_` prefixes.
//
// The function holds no database key. It talks to the database as the caller
// (their login token + the publishable key the app already sends), so the
// database itself decides whether the caller is a household member. Deploy
// with --no-verify-jwt: the gateway's built-in check is tied to the legacy
// keys, which are disabled on this project; PostgREST verifies the token.
//
// Secrets: MAJADOR_VAPID_PUBLIC_KEY, MAJADOR_VAPID_PRIVATE_KEY,
// MAJADOR_VAPID_SUBJECT (a mailto: or https: contact URL).

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'
import { addedText } from './text.ts'

// "Vare tilføjet": items the same person added within this window are counted
// into one notification, which replaces the previous one on the phone.
const ADDED_WINDOW_MS = 10 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Message = {
  payload: { title: string; body: string; tag: string; silent?: boolean }
  /** Which SECURITY DEFINER RPC lists the devices to send to. */
  targets: 'push_targets' | 'push_targets_others'
  /** web-push delivery options (TTL in seconds, urgency, topic). */
  options?: { TTL?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = req.headers.get('Authorization')
  const apikey = req.headers.get('apikey')
  if (!authorization || !apikey) return json({ error: 'Not logged in' }, 401)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, apikey, {
    db: { schema: 'majador' },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })

  // RLS on members returns the caller's own row only if they are a member.
  const { data: userData, error: userError } = await db.auth.getUser(
    authorization.replace(/^Bearer\s+/i, ''),
  )
  if (userError || !userData.user) return json({ error: 'Not logged in' }, 401)
  const user = userData.user
  const { data: member } = await db
    .from('members')
    .select('display_name')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return json({ error: 'Not a household member' }, 403)

  const body = await req.json().catch(() => ({}))
  let message: Message

  if (body.type === 'test') {
    message = {
      payload: {
        title: 'MajaDor',
        body: `Testnotifikation fra ${member.display_name}`,
        tag: 'majador-test',
      },
      targets: 'push_targets',
    }
  } else if (body.type === 'shopping.added') {
    // The items the app just sent (they can be old: added without signal and
    // synced now) plus everything the caller added in the last few minutes,
    // as long as it is still on the list.
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.filter((id: unknown) => typeof id === 'string' && UUID.test(id)).slice(0, 50)
      : []
    const mine = () =>
      db
        .from('shopping_items')
        .select('id, text, added_at')
        .eq('added_by', user.id)
        .is('bought_at', null)
        .limit(50)
    const since = new Date(Date.now() - ADDED_WINDOW_MS).toISOString()
    const [recent, named] = await Promise.all([
      mine().gte('added_at', since),
      ids.length ? mine().in('id', ids) : Promise.resolve({ data: [], error: null }),
    ])
    if (recent.error || named.error) {
      return json({ error: (recent.error ?? named.error)!.message }, 500)
    }
    const items = new Map<string, { id: string; text: string; added_at: string }>()
    for (const row of [...(recent.data ?? []), ...(named.data ?? [])]) items.set(row.id, row)
    // Deleted or bought again before we got here: nothing to tell.
    if (items.size === 0) return json({ sent: 0, failed: 0, removed: 0 })
    const newestFirst = [...items.values()].sort((a, b) => b.added_at.localeCompare(a.added_at))

    message = {
      payload: {
        ...addedText(member.display_name, newestFirst.map((i) => i.text)),
        tag: 'indkob-tilfojet',
        silent: true,
      },
      targets: 'push_targets_others',
      // Low urgency: a sleeping phone is not woken for this. Topic: if the
      // phone is offline, only the latest (which counts them all) is kept.
      options: { TTL: 24 * 60 * 60, urgency: 'low', topic: 'indkob-tilfojet' },
    }
  } else {
    return json({ error: 'Unknown type' }, 400)
  }

  const payload = JSON.stringify(message.payload)

  webpush.setVapidDetails(
    Deno.env.get('MAJADOR_VAPID_SUBJECT')!,
    Deno.env.get('MAJADOR_VAPID_PUBLIC_KEY')!,
    Deno.env.get('MAJADOR_VAPID_PRIVATE_KEY')!,
  )

  const { data: subs, error: subsError } = await db.rpc(message.targets)
  if (subsError) return json({ error: subsError.message }, 500)

  let sent = 0
  let failed = 0
  const gone: number[] = []

  await Promise.all(
    ((subs ?? []) as { id: number; endpoint: string; p256dh: string; auth: string }[]).map(
      async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            message.options,
          )
          sent++
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode
          // 404/410: the device unsubscribed or the app was removed.
          if (status === 404 || status === 410) gone.push(s.id)
          else failed++
        }
      },
    ),
  )

  if (gone.length) await db.rpc('remove_push_subscriptions', { p_ids: gone })

  return json({ sent, failed, removed: gone.length })
})

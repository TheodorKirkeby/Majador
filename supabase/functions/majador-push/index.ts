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
  const { data: member } = await db
    .from('members')
    .select('display_name')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (!member) return json({ error: 'Not a household member' }, 403)

  const body = await req.json().catch(() => ({}))
  if (body.type !== 'test') return json({ error: 'Unknown type' }, 400)

  const payload = JSON.stringify({
    title: 'MajaDor',
    body: `Test notification from ${member.display_name}`,
    tag: 'majador-test',
  })

  webpush.setVapidDetails(
    Deno.env.get('MAJADOR_VAPID_SUBJECT')!,
    Deno.env.get('MAJADOR_VAPID_PUBLIC_KEY')!,
    Deno.env.get('MAJADOR_VAPID_PRIVATE_KEY')!,
  )

  const { data: subs, error: subsError } = await db.rpc('push_targets')
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

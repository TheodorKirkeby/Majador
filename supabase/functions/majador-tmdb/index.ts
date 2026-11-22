// majador-tmdb: looks a film or series title up in The Movie Database (TMDB)
// and returns a few matches with summary, year and poster.
//
// It exists so the TMDB key stays a server secret instead of being shipped in
// the public app. Like majador-push it holds no database key: it checks, as
// the caller, that they are a household member. Deploy with --no-verify-jwt.
//
// Secret: MAJADOR_TMDB_KEY. Either of the two values TMDB shows under
// Settings -> API works: the long "API Read Access Token" or the short
// "API Key".

import { createClient } from 'npm:@supabase/supabase-js@2'
import { rank, type TmdbResult } from './rank.ts'

const MAX_RESULTS = 6

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
  const { data: userData, error: userError } = await db.auth.getUser(
    authorization.replace(/^Bearer\s+/i, ''),
  )
  if (userError || !userData.user) return json({ error: 'Not logged in' }, 401)
  // RLS on members returns the caller's own row only if they are a member.
  const { data: member } = await db
    .from('members')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (!member) return json({ error: 'Not a household member' }, 403)

  const key = Deno.env.get('MAJADOR_TMDB_KEY')
  if (!key) return json({ error: 'MAJADOR_TMDB_KEY is not set' }, 500)

  const body = await req.json().catch(() => ({}))
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 100) : ''
  if (query.length < 2) return json({ results: [] })

  // The read access token is a JWT (has dots) and goes in a header; the short
  // API key goes in the query string.
  const bearer = key.includes('.')
  async function search(language: string): Promise<TmdbResult[]> {
    const url = new URL('https://api.themoviedb.org/3/search/multi')
    url.searchParams.set('query', query)
    url.searchParams.set('language', language)
    url.searchParams.set('include_adult', 'false')
    if (!bearer) url.searchParams.set('api_key', key!)
    const res = await fetch(url, { headers: bearer ? { Authorization: `Bearer ${key}` } : {} })
    if (!res.ok) throw new Error(`TMDB answered ${res.status}`)
    return ((await res.json()).results ?? []) as TmdbResult[]
  }

  try {
    // The same search in Danish and English (20 matches each); rank() merges
    // them and picks the few to suggest.
    const [danish, english] = await Promise.all([search('da-DK'), search('en-US')])
    return json({ results: rank(query, danish, english, MAX_RESULTS) })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})

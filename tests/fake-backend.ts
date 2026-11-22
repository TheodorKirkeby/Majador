// An in-memory stand-in for Supabase. Every request the app makes to auth,
// the database (PostgREST) and the Edge Functions is answered from here, so
// the tests run without a network and never touch the real project.
//
// Tests read and change the state directly: seed rows before logging in,
// then assert on what the app wrote.

import { expect, test as base, type Page, type Route } from '@playwright/test'

export const THEODOR = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Theodor',
  email: 'theodor@example.com',
}
export const MAJA = { id: '22222222-2222-4222-8222-222222222222', name: 'Maja' }
export const PASSWORD = 'hemmelig'

type Row = Record<string, unknown> & { id: string }
export type Rating = { movie_id: string; user_id: string; rating: number }

export type FakeBackend = {
  items: Row[]
  movies: Row[]
  ratings: Rating[]
  /** Bodies sent to the majador-push function. */
  pushes: { type: string; ids?: string[] }[]
  tmdb: {
    /** What the lookup answers. */
    results: unknown[]
    /** Milliseconds before it answers. */
    delay: number
    fail: boolean
    queries: string[]
  }
  /** true = every request fails as if there were no signal. */
  offline: boolean
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
}

// A 1x1 transparent PNG, served for every poster.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

function session() {
  const now = Math.floor(Date.now() / 1000)
  const user = {
    id: THEODOR.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: THEODOR.email,
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  }
  return {
    // Shaped like a real login token; nothing checks the signature.
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: 'authenticated', aud: 'authenticated', email: user.email, exp: now + 3600 })}.fake`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'fake-refresh-token',
    user,
  }
}

async function install(page: Page): Promise<FakeBackend> {
  const db: FakeBackend = {
    items: [],
    movies: [],
    ratings: [],
    pushes: [],
    tmdb: { results: [], delay: 0, fail: false, queries: [] },
    offline: false,
  }

  // Realtime: the socket opens and stays silent. The app also syncs on its
  // own, so the lists still load.
  await page.routeWebSocket(/\/realtime\/v1\//, () => {})
  await page.route(/image\.tmdb\.org/, (route) =>
    route.fulfill({ contentType: 'image/png', body: PIXEL }),
  )

  await page.route(/\/(auth|rest|functions)\/v1\//, async (route: Route) => {
    if (db.offline) return route.abort('internetdisconnected')
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const reply = (status: number, body?: unknown) =>
      route.fulfill({
        status,
        headers: CORS,
        contentType: 'application/json',
        body: body === undefined ? '' : JSON.stringify(body),
      })
    const body = () => request.postDataJSON() as Record<string, unknown>

    // ── Auth ──
    if (url.pathname.endsWith('/auth/v1/token')) {
      if (url.searchParams.get('grant_type') === 'password' && body().password !== PASSWORD) {
        return reply(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      }
      return reply(200, session())
    }
    if (url.pathname.endsWith('/auth/v1/user')) return reply(200, session().user)
    if (url.pathname.endsWith('/auth/v1/logout')) return reply(204)

    // ── Edge Functions ──
    if (url.pathname.endsWith('/functions/v1/majador-push')) {
      db.pushes.push(body() as FakeBackend['pushes'][number])
      return reply(200, { sent: 1, failed: 0, removed: 0 })
    }
    if (url.pathname.endsWith('/functions/v1/majador-tmdb')) {
      db.tmdb.queries.push(String(body().query))
      if (db.tmdb.delay) await new Promise((resolve) => setTimeout(resolve, db.tmdb.delay))
      return db.tmdb.fail
        ? reply(502, { error: 'TMDB answered 500' })
        : reply(200, { results: db.tmdb.results })
    }

    // ── Database ──
    const table = url.pathname.split('/rest/v1/')[1]
    const id = url.searchParams.get('id')?.replace(/^eq\./, '')

    if (table === 'members') {
      return reply(200, [
        { user_id: THEODOR.id, display_name: THEODOR.name },
        { user_id: MAJA.id, display_name: MAJA.name },
      ])
    }

    if (table === 'movie_ratings' && method === 'POST') {
      const r = body() as unknown as Rating
      db.ratings = db.ratings.filter((x) => x.movie_id !== r.movie_id || x.user_id !== r.user_id)
      db.ratings.push({ movie_id: r.movie_id, user_id: r.user_id, rating: r.rating })
      return reply(201)
    }

    if (table === 'shopping_items' || table === 'movies') {
      const key = table === 'movies' ? 'movies' : 'items'
      if (method === 'GET') {
        return reply(
          200,
          table === 'movies'
            ? db.movies.map((m) => ({
                ...m,
                movie_ratings: db.ratings
                  .filter((r) => r.movie_id === m.id)
                  .map(({ user_id, rating }) => ({ user_id, rating })),
              }))
            : db.items,
        )
      }
      if (method === 'POST') {
        db[key].push(body() as Row)
        return reply(201)
      }
      if (method === 'PATCH') {
        db[key] = db[key].map((row) => (row.id === id ? { ...row, ...body() } : row))
        return reply(204)
      }
      if (method === 'DELETE') {
        db[key] = db[key].filter((row) => row.id !== id)
        if (table === 'movies') db.ratings = db.ratings.filter((r) => r.movie_id !== id)
        return reply(204)
      }
    }

    return reply(404, { code: 'TEST404', message: `Fake backend: no answer for ${method} ${url.pathname}` })
  })

  return db
}

type Fixtures = {
  backend: FakeBackend
  /** Opens the app and logs in as Theodor. */
  login: () => Promise<void>
}

export const test = base.extend<Fixtures>({
  backend: async ({ page }, provide) => {
    // The "install the app" popup covers the page in a browser tab; it has its
    // own test, everything else starts with it dismissed.
    await page.addInitScript(() => sessionStorage.setItem('majador-install-dismissed', '1'))
    await provide(await install(page))
  },
  login: async ({ page, backend: _backend }, provide) => {
    await provide(async () => {
      await page.goto('/')
      await page.getByLabel('Email').fill(THEODOR.email)
      await page.getByLabel('Adgangskode').fill(PASSWORD)
      await page.getByRole('button', { name: 'Log ind' }).click()
      await expect(page.getByRole('navigation', { name: 'Sider' })).toBeVisible()
    })
  },
})

export { expect }

let serial = 0
/** A film row as the database holds it. */
export function movie(title: string, extra: Record<string, unknown> = {}): Row {
  serial++
  return {
    id: `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    title,
    description: null,
    kind: 'movie',
    watched_on: null,
    summary: null,
    poster_path: null,
    year: null,
    tmdb_id: null,
    added_by: MAJA.id,
    added_at: new Date(Date.UTC(2026, 0, serial)).toISOString(),
    ...extra,
  }
}

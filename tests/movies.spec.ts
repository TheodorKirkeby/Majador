import type { Page } from '@playwright/test'
import { expect, MAJA, movie, test, THEODOR } from './fake-backend.ts'

const TITANIC = {
  tmdb_id: 597,
  kind: 'movie',
  title: 'Titanic',
  year: 1997,
  summary: 'En ung kunstner og en overklassepige forelsker sig om bord på det dødsdømte skib.',
  poster_path: '/titanic.jpg',
}
const TITANS = {
  tmdb_id: 1,
  kind: 'series',
  title: 'Titans',
  year: 2018,
  summary: null,
  poster_path: null,
}
const ARRIVANO = {
  tmdb_id: 2,
  kind: 'movie',
  title: 'Arrivano i titani',
  year: 1962,
  summary: 'Italiensk eventyrfilm.',
  poster_path: '/arrivano.jpg',
}

async function openFilms(page: Page) {
  await page.getByRole('navigation', { name: 'Sider' }).getByRole('button', { name: 'Film' }).click()
}

async function openAddForm(page: Page) {
  await openFilms(page)
  await page.getByRole('button', { name: 'Tilføj film eller serie' }).click()
  return page.getByRole('dialog', { name: 'Tilføj film eller serie' })
}

const whole = (page: Page, n: number) =>
  page
    .getByRole('group', { name: 'Din bedømmelse fra 1 til 10' })
    .getByRole('button', { name: String(n), exact: true })

test('adding a film takes a title and one tap on a rating', async ({ page, backend, login }) => {
  await login()
  const form = await openAddForm(page)
  await form.getByLabel('Titel').fill('Druk')
  await whole(page, 8).click()
  await form.getByRole('button', { name: 'Tilføj', exact: true }).click()

  await expect(form).toBeHidden()
  const row = page.locator('.movie', { hasText: 'Druk' })
  await expect(row.locator('.movie-score')).toHaveText('8')
  await expect(row).toContainText('Theodor 8')
  await expect(row).toContainText('Maja –')

  await expect.poll(() => backend.movies.length).toBe(1)
  expect(backend.movies[0]).toMatchObject({ title: 'Druk', kind: 'movie', added_by: THEODOR.id })
  await expect
    .poll(() => backend.ratings)
    .toEqual([{ movie_id: backend.movies[0].id, user_id: THEODOR.id, rating: 8 }])
  await expect.poll(() => backend.pushes).toEqual([{ type: 'movie.added', ids: [backend.movies[0].id] }])
})

test('a rating is required when adding', async ({ page, backend, login }) => {
  await login()
  const form = await openAddForm(page)
  await form.getByLabel('Titel').fill('Druk')
  await form.getByRole('button', { name: 'Tilføj', exact: true }).click()

  await expect(form.getByText('Vælg en bedømmelse fra 1 til 10.')).toBeVisible()
  expect(backend.movies).toEqual([])
})

test('"Tilføj decimal" sits on the rating label row and gives ratings like 7,5', async ({
  page,
  backend,
  login,
}) => {
  await login()
  const form = await openAddForm(page)
  const label = form.getByText('Din bedømmelse', { exact: true })
  const more = form.getByRole('button', { name: 'Tilføj decimal' })

  // Same row: the link is to the right of the label, not on a line of its own.
  const labelBox = (await label.boundingBox())!
  const moreBox = (await more.boundingBox())!
  expect(Math.abs(labelBox.y + labelBox.height / 2 - (moreBox.y + moreBox.height / 2))).toBeLessThan(8)
  expect(moreBox.x).toBeGreaterThan(labelBox.x + labelBox.width)

  await form.getByLabel('Titel').fill('Severance')
  await whole(page, 7).click()
  await more.click()
  await expect(more).toBeHidden()
  await form.getByRole('group', { name: 'Decimal' }).getByRole('button', { name: ',5' }).click()
  await expect(form.locator('.rating-value')).toHaveText('7,5')
  await form.getByRole('button', { name: 'Serie' }).click()
  await form.getByRole('button', { name: 'Tilføj', exact: true }).click()

  await expect(page.locator('.movie', { hasText: 'Severance' }).locator('.movie-score')).toHaveText('7,5')
  await expect.poll(() => backend.ratings.map((r) => r.rating)).toEqual([7.5])
  expect(backend.movies[0].kind).toBe('series')
})

test('where it was watched is picked from a drawer, and the opinion is saved', async ({
  page,
  backend,
  login,
}) => {
  await login()
  const form = await openAddForm(page)
  await form.getByLabel('Titel').fill('Druk')
  await whole(page, 9).click()

  await form.locator('.field-button').click()
  const places = page.getByRole('dialog', { name: 'Hvor så I den?' })
  for (const place of ['Netflix', 'Sky', 'HBO', 'Disney+', 'DR', 'Viaplay', 'TV 2', 'Biografen', 'Andet']) {
    await expect(places.getByRole('button', { name: place, exact: true })).toBeVisible()
  }
  await places.getByRole('button', { name: 'Biografen' }).click()
  await expect(places).toBeHidden()
  await expect(form.locator('.field-button')).toHaveText('Biografen')

  await form.getByLabel('Hvad synes I?').fill('Mads Mikkelsen danser.')
  await form.getByRole('button', { name: 'Tilføj', exact: true }).click()

  const row = page.locator('.movie', { hasText: 'Druk' })
  await expect(row).toContainText('Film · Biografen')
  await expect(row).toContainText('Mads Mikkelsen danser.')
  await expect.poll(() => backend.movies[0]?.watched_on).toBe('cinema')
  expect(backend.movies[0].description).toBe('Mads Mikkelsen danser.')
})

test('typing a title shows a loading line, then suggestions that are fully visible', async ({
  page,
  backend,
  login,
}) => {
  backend.tmdb.results = [TITANIC, TITANS, ARRIVANO]
  backend.tmdb.delay = 400
  await login()
  // As short as a phone screen with the keyboard open.
  await page.setViewportSize({ width: 412, height: 460 })
  const form = await openAddForm(page)
  await form.getByLabel('Titel').fill('Titani')

  await expect(form.getByText('Søger efter forslag…')).toBeVisible()
  const list = form.getByRole('list', { name: 'Forslag fra TMDB' })
  await expect(list.getByRole('button')).toHaveCount(3)
  await expect(form.getByText('Søger efter forslag…')).toBeHidden()
  expect(backend.tmdb.queries).toEqual(['Titani'])

  // Not squeezed: the list is as tall as its three rows.
  const height = await list.evaluate((el) => el.getBoundingClientRect().height)
  const rows = await list.evaluate((el) =>
    [...el.children].reduce((sum, li) => sum + li.getBoundingClientRect().height, 0),
  )
  expect(rows).toBeGreaterThan(3 * 40)
  expect(height).toBeGreaterThanOrEqual(rows)
  await expect(list.getByRole('button', { name: /Titanic/ })).toBeInViewport({ ratio: 1 })
})

test('picking a suggestion stores title, summary, poster and year', async ({ page, backend, login }) => {
  backend.tmdb.results = [TITANIC, TITANS]
  await login()
  const form = await openAddForm(page)
  await form.getByLabel('Titel').fill('titan')
  await form.getByRole('button', { name: /Titanic/ }).click()

  await expect(form.getByLabel('Titel')).toHaveValue('Titanic')
  await expect(form.getByRole('list', { name: 'Forslag fra TMDB' })).toBeHidden()
  await expect(form.getByText(TITANIC.summary)).toBeVisible()
  await whole(page, 10).click()
  await form.getByRole('button', { name: 'Tilføj', exact: true }).click()

  const row = page.locator('.movie', { hasText: 'Titanic' })
  await expect(row).toContainText('Film · 1997')
  await expect(row).toContainText(TITANIC.summary)
  await expect(row.locator('img.poster')).toHaveAttribute('src', /image\.tmdb\.org.*\/titanic\.jpg$/)
  await expect.poll(() => backend.movies[0]).toMatchObject({
    title: 'Titanic',
    tmdb_id: 597,
    year: 1997,
    summary: TITANIC.summary,
    poster_path: '/titanic.jpg',
  })
})

test('picking a series suggestion switches the form to Serie', async ({ page, backend, login }) => {
  backend.tmdb.results = [TITANS]
  await login()
  const form = await openAddForm(page)
  await form.getByLabel('Titel').fill('titans')
  await form.getByRole('button', { name: /Titans/ }).click()
  await expect(form.getByRole('button', { name: 'Serie' })).toHaveAttribute('aria-pressed', 'true')
})

test('a film can still be added when the lookup fails or finds nothing', async ({
  page,
  backend,
  login,
}) => {
  backend.tmdb.fail = true
  await login()
  const form = await openAddForm(page)
  await form.getByLabel('Titel').fill('Hjemmevideo')
  await expect(form.getByText('Kunne ikke hente forslag.')).toBeVisible()

  backend.tmdb.fail = false
  await form.getByLabel('Titel').fill('Hjemmevideo 2')
  await expect(form.getByText('Ingen forslag fra TMDB.')).toBeVisible()

  await whole(page, 6).click()
  await form.getByRole('button', { name: 'Tilføj', exact: true }).click()
  await expect(page.locator('.movie', { hasText: 'Hjemmevideo 2' })).toBeVisible()
  await expect.poll(() => backend.movies[0]).toMatchObject({ title: 'Hjemmevideo 2', tmdb_id: null })
})

test("the other person's film can be rated, and the big number is the average", async ({
  page,
  backend,
  login,
}) => {
  const dune = movie('Dune', { watched_on: 'cinema' })
  backend.movies.push(dune)
  backend.ratings.push({ movie_id: dune.id, user_id: MAJA.id, rating: 9 })
  await login()
  await openFilms(page)

  const row = page.locator('.movie', { hasText: 'Dune' })
  await expect(row.locator('.movie-score')).toHaveText('9')
  await row.click()

  const form = page.getByRole('dialog', { name: 'Film eller serie' })
  await expect(form.getByText('Maja gav 9.')).toBeVisible()
  await expect(form.getByText(/Tilføjet af Maja/)).toBeVisible()
  await whole(page, 6).click()
  await form.getByRole('button', { name: 'Gem' }).click()

  await expect(row.locator('.movie-score')).toHaveText('7,5')
  await expect(row).toContainText('Theodor 6')
  await expect
    .poll(() => backend.ratings)
    .toContainEqual({ movie_id: dune.id, user_id: THEODOR.id, rating: 6 })
  // Maja's rating is untouched, and rating someone's film is not announced.
  expect(backend.ratings).toContainEqual({ movie_id: dune.id, user_id: MAJA.id, rating: 9 })
  expect(backend.pushes).toEqual([])
})

test('an existing rating with a decimal opens with the decimal row showing', async ({
  page,
  backend,
  login,
}) => {
  const dune = movie('Dune')
  backend.movies.push(dune)
  backend.ratings.push({ movie_id: dune.id, user_id: THEODOR.id, rating: 8.5 })
  await login()
  await openFilms(page)
  await page.locator('.movie', { hasText: 'Dune' }).click()

  const form = page.getByRole('dialog', { name: 'Film eller serie' })
  await expect(whole(page, 8)).toHaveAttribute('aria-pressed', 'true')
  await expect(
    form.getByRole('group', { name: 'Decimal' }).getByRole('button', { name: ',5' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(form.getByRole('button', { name: 'Tilføj decimal' })).toBeHidden()
})

test('details can be edited, and an old film can be matched with TMDB afterwards', async ({
  page,
  backend,
  login,
}) => {
  const old = movie('Titanik')
  backend.movies.push(old)
  backend.tmdb.results = [TITANIC]
  await login()
  await openFilms(page)
  await page.locator('.movie', { hasText: 'Titanik' }).click()

  const form = page.getByRole('dialog', { name: 'Film eller serie' })
  await form.getByRole('button', { name: 'Find resumé og plakat' }).click()
  await form.getByRole('button', { name: /Titanic/ }).click()
  await form.getByRole('button', { name: 'Gem' }).click()

  await expect(page.locator('.movie', { hasText: 'Titanic' })).toContainText(TITANIC.summary)
  await expect.poll(() => backend.movies[0]).toMatchObject({ title: 'Titanic', tmdb_id: 597 })
})

test('deleting a film takes two taps', async ({ page, backend, login }) => {
  backend.movies.push(movie('Dune'))
  await login()
  await openFilms(page)
  await page.locator('.movie', { hasText: 'Dune' }).click()

  const form = page.getByRole('dialog', { name: 'Film eller serie' })
  await form.getByRole('button', { name: 'Slet' }).click()
  expect(backend.movies).toHaveLength(1)
  await form.getByRole('button', { name: 'Tryk igen for at slette' }).click()

  await expect(page.getByText('Ingen film eller serier endnu')).toBeVisible()
  await expect.poll(() => backend.movies).toEqual([])
})

test('search opens from the top bar, filters the list and opens a film', async ({
  page,
  backend,
  login,
}) => {
  backend.movies.push(
    movie('Dune', { summary: 'Ørkenplaneten Arrakis.' }),
    movie('Druk', { watched_on: 'netflix' }),
    movie('Severance', { kind: 'series' }),
  )
  await login()
  await openFilms(page)
  await page.getByRole('button', { name: 'Søg i film og serier' }).click()

  const search = page.getByRole('dialog', { name: 'Søg i film og serier' })
  const box = search.getByRole('searchbox')
  await expect(box).toBeFocused()
  await expect(search.locator('.movie')).toHaveCount(3)

  await box.fill('dr')
  await expect(search.locator('.movie')).toHaveText([/Druk/])
  await box.fill('arrakis')
  await expect(search.locator('.movie')).toHaveText([/Dune/])
  await box.fill('netflix')
  await expect(search.locator('.movie')).toHaveText([/Druk/])
  await box.fill('serie')
  await expect(search.locator('.movie')).toHaveText([/Severance/])
  await box.fill('findes ikke')
  await expect(search.getByText('Ingen resultater.')).toBeVisible()

  await box.fill('dune')
  await search.locator('.movie').click()
  await expect(page.getByRole('dialog', { name: 'Film eller serie' }).getByLabel('Titel')).toHaveValue('Dune')
  await page.getByRole('button', { name: 'Annuller' }).click()

  await search.getByRole('button', { name: 'Luk' }).click()
  await expect(search).toBeHidden()
})

test('the page behind an open drawer or the search screen cannot be scrolled', async ({
  page,
  backend,
  login,
}) => {
  for (let i = 0; i < 25; i++) backend.movies.push(movie(`Film ${i}`))
  await login()
  await openFilms(page)
  await expect(page.locator('.movie')).toHaveCount(25)
  const pageScroll = () => page.evaluate(() => getComputedStyle(document.documentElement).overflowY)
  const scrollY = () => page.evaluate(() => window.scrollY)
  expect(await pageScroll()).not.toBe('hidden')

  await page.getByRole('button', { name: 'Tilføj film eller serie' }).click()
  expect(await pageScroll()).toBe('hidden')
  await page.mouse.move(200, 400)
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(200)
  expect(await scrollY()).toBe(0)

  await page.getByRole('button', { name: 'Annuller' }).click()
  expect(await pageScroll()).not.toBe('hidden')

  await page.getByRole('button', { name: 'Søg i film og serier' }).click()
  expect(await pageScroll()).toBe('hidden')
})

test('films are cached and shown without signal', async ({ page, backend, login }) => {
  backend.movies.push(movie('Dune'))
  await login()
  await openFilms(page)
  await expect(page.locator('.movie', { hasText: 'Dune' })).toBeVisible()

  backend.offline = true
  await page.reload()
  await openFilms(page)
  await expect(page.locator('.movie', { hasText: 'Dune' })).toBeVisible()
  // The database client retries a failed read a few times before giving up.
  await expect(page.getByText('Ingen forbindelse.')).toBeVisible({ timeout: 30_000 })
})

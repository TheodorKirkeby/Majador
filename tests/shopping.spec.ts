import type { Locator, Page } from '@playwright/test'
import { expect, PASSWORD, test, THEODOR } from './fake-backend.ts'

/** Drags a list row sideways, like a finger swipe. */
async function swipe(page: Page, row: Locator, dx: number) {
  const box = (await row.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 4, y, { steps: 3 })
  await page.mouse.move(x + dx, y, { steps: 8 })
  await page.mouse.up()
}

test('a wrong password gives a Danish error, the right one logs in', async ({ page, backend: _backend }) => {
  await page.goto('/')
  await page.getByLabel('Email').fill(THEODOR.email)
  await page.getByLabel('Adgangskode').fill('forkert')
  await page.getByRole('button', { name: 'Log ind' }).click()
  await expect(page.getByText('Forkert email eller adgangskode.')).toBeVisible()

  await page.getByLabel('Adgangskode').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log ind' }).click()
  await expect(page.getByText('Listen er tom')).toBeVisible()
})

test('the install popup shows in a browser tab and can be dismissed', async ({ page, login }) => {
  // Runs after the fixture's script, undoing its "already dismissed".
  await page.addInitScript(() => sessionStorage.removeItem('majador-install-dismissed'))
  await login()
  const popup = page.getByRole('dialog', { name: 'Installér MajaDor' })
  await expect(popup).toBeVisible()
  await popup.getByRole('button', { name: 'Ikke nu' }).click()
  await expect(popup).toBeHidden()
})

test('adding an item saves it and notifies the other person', async ({ page, backend, login }) => {
  await login()
  await page.getByLabel('Tilføj en vare').fill('mælk')
  await page.getByRole('button', { name: 'Tilføj', exact: true }).click()

  await expect(page.locator('.items')).toContainText('mælk')
  await expect(page.getByRole('button', { name: 'Skal købes (1)' })).toBeVisible()
  await expect.poll(() => backend.items.map((i) => i.text)).toEqual(['mælk'])
  expect(backend.items[0].added_by).toBe(THEODOR.id)
  await expect.poll(() => backend.pushes).toEqual([{ type: 'shopping.added', ids: [backend.items[0].id] }])
})

test('swiping right marks an item as bought, and undo brings it back', async ({ page, backend, login }) => {
  backend.items.push({
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    text: 'kaffe',
    added_by: THEODOR.id,
    added_at: new Date().toISOString(),
    bought_at: null,
    bought_by: null,
  })
  await login()
  const row = page.locator('.swipe-row', { hasText: 'kaffe' })
  await swipe(page, row, 250)

  await expect(page.getByText('Købt: kaffe')).toBeVisible()
  await expect(page.getByText('Listen er tom')).toBeVisible()
  await expect.poll(() => backend.items[0].bought_by).toBe(THEODOR.id)

  await page.getByRole('button', { name: 'Købt', exact: true }).click()
  await expect(page.locator('.items')).toContainText('kaffe')

  await page.getByRole('button', { name: /Skal købes/ }).click()
  await page.getByRole('button', { name: 'Fortryd' }).click()
  await expect(page.locator('.items')).toContainText('kaffe')
  await expect.poll(() => backend.items[0].bought_at).toBeNull()
})

test('swiping left deletes an item', async ({ page, backend, login }) => {
  backend.items.push({
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    text: 'smør',
    added_by: THEODOR.id,
    added_at: new Date().toISOString(),
    bought_at: null,
    bought_by: null,
  })
  await login()
  await swipe(page, page.locator('.swipe-row', { hasText: 'smør' }), -250)
  await expect(page.getByText('Slettet: smør')).toBeVisible()
  await expect.poll(() => backend.items).toEqual([])
})

test('items added without signal are kept and sent when the connection is back', async ({
  page,
  backend,
  login,
}) => {
  await login()
  backend.offline = true
  await page.getByLabel('Tilføj en vare').fill('æg')
  await page.getByRole('button', { name: 'Tilføj', exact: true }).click()

  await expect(page.locator('.items')).toContainText('æg')
  await expect(page.getByText('1 ændring sendes, når du er online igen.')).toBeVisible()
  expect(backend.items).toEqual([])

  // Still there after closing and reopening the app without signal.
  await page.reload()
  await expect(page.locator('.items')).toContainText('æg')

  backend.offline = false
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => backend.items.map((i) => i.text)).toEqual(['æg'])
  await expect(page.getByText('Ingen forbindelse')).toBeHidden()
})

test('the bottom menu switches between shopping and films', async ({ page, login }) => {
  await login()
  const menu = page.getByRole('navigation', { name: 'Sider' })
  await expect(menu.getByRole('button', { name: 'Indkøb' })).toHaveAttribute('aria-current', 'page')

  await menu.getByRole('button', { name: 'Film' }).click()
  await expect(page.getByText('Ingen film eller serier endnu')).toBeVisible()
  await expect(page.getByLabel('Tilføj en vare')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Søg i film og serier' })).toBeVisible()

  await menu.getByRole('button', { name: 'Indkøb' }).click()
  await expect(page.getByLabel('Tilføj en vare')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Søg i film og serier' })).toBeHidden()
})

test('settings open from the gear and the menu leads back out', async ({ page, login }) => {
  await login()
  await page.getByRole('button', { name: 'Indstillinger' }).click()
  await expect(page.getByText(`Logget ind som ${THEODOR.email}`)).toBeVisible()
  await expect(page.getByText('Medlem af husstanden: Theodor')).toBeVisible()

  await page.getByRole('navigation', { name: 'Sider' }).getByRole('button', { name: 'Film' }).click()
  await expect(page.getByText('Ingen film eller serier endnu')).toBeVisible()
})

test('logging out returns to the login form', async ({ page, login }) => {
  await login()
  await page.getByRole('button', { name: 'Indstillinger' }).click()
  await page.getByRole('button', { name: 'Log ud' }).click()
  await expect(page.getByRole('button', { name: 'Log ind' })).toBeVisible()
})

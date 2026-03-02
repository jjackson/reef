import { test, expect } from '@playwright/test'
import { setupMockRoutes } from '../fixtures/mock-routes'
import { MOCK_MULTI_WORKSPACES } from '../fixtures/mock-data'

test.describe('Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockRoutes(page)
    await page.goto('/')
  })

  test('renders reef branding and version', async ({ page }) => {
    await expect(page.locator('aside h1', { hasText: 'reef' })).toBeVisible()
    await expect(page.getByText('OpenClaw management')).toBeVisible()
    await expect(page.getByText(/reef v\d+\.\d+\.\d+/)).toBeVisible()
  })

  test('lists instances in sidebar', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'openclaw-hal' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'openclaw-ada' })).toBeVisible()
  })

  test('expanding instance loads and shows agents', async ({ page }) => {
    const instanceRow = page.locator('.font-semibold', { hasText: 'openclaw-hal' }).locator('..')
    await instanceRow.locator('button').first().click()

    await expect(page.getByText('Hal', { exact: true })).toBeVisible()
    await expect(page.getByText('Helper', { exact: true })).toBeVisible()
  })

  test('clicking instance name switches to instance view', async ({ page }) => {
    await page.getByRole('button', { name: 'openclaw-hal' }).click()
    await expect(page.getByText('167.71.100.1')).toBeVisible()
  })

  test('clicking agent switches to agent detail view', async ({ page }) => {
    // Expand instance first
    const instanceRow = page.locator('.font-semibold', { hasText: 'openclaw-hal' }).locator('..')
    await instanceRow.locator('button').first().click()
    await expect(page.getByText('Hal', { exact: true })).toBeVisible()

    // Click on agent
    await page.getByText('Hal', { exact: true }).first().click()
    await expect(page.getByText('anthropic/claude-opus-4-6')).toBeVisible()
  })

  test('reef logo click returns to home', async ({ page }) => {
    // Navigate away from home
    await page.getByRole('button', { name: 'openclaw-hal' }).click()
    await expect(page.getByText('167.71.100.1')).toBeVisible()

    // Click logo to go home
    await page.locator('h1', { hasText: 'reef' }).click()
    await expect(page.getByText('OpenClaw Fleet Management')).toBeVisible()
  })

  test('select all checkbox exists', async ({ page }) => {
    await expect(page.getByText('Select all')).toBeVisible()
  })
})

test.describe('Sidebar with multiple workspaces', () => {
  test('workspace dropdown appears when >1 workspace', async ({ page }) => {
    await setupMockRoutes(page)
    // Override workspaces for multi-workspace scenario
    await page.route(/\/api\/workspaces\/?$/, route =>
      route.fulfill({ json: MOCK_MULTI_WORKSPACES })
    )
    await page.goto('/')

    const select = page.locator('select')
    await expect(select).toBeVisible()
    await expect(page.locator('option', { hasText: 'Production' })).toBeAttached()
    await expect(page.locator('option', { hasText: 'Development' })).toBeAttached()
  })
})

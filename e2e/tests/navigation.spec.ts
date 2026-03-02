import { test, expect } from '@playwright/test'
import { setupMockRoutes } from '../fixtures/mock-routes'

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockRoutes(page)
    await page.goto('/')
  })

  test('default view is home', async ({ page }) => {
    await expect(page.getByText('OpenClaw Fleet Management')).toBeVisible()
  })

  test('home -> instance -> home round trip', async ({ page }) => {
    // Navigate to instance
    await page.getByRole('button', { name: 'openclaw-hal' }).click()
    await expect(page.getByText('openclaw-hal').first()).toBeVisible()
    await expect(page.getByText('167.71.100.1')).toBeVisible()

    // Click reef logo to go home
    await page.locator('h1', { hasText: 'reef' }).click()
    await expect(page.getByText('OpenClaw Fleet Management')).toBeVisible()
  })

  test('instance -> expand agents -> click agent -> agent detail', async ({ page }) => {
    // Click instance name to go to instance view
    await page.getByRole('button', { name: 'openclaw-hal' }).click()

    // Expand the instance in the sidebar to load agents
    // The expand button is the small triangle before the instance name
    const instanceRow = page.locator('.font-semibold', { hasText: 'openclaw-hal' }).locator('..')
    await instanceRow.locator('button').first().click()

    // Agents should load
    await expect(page.getByText('Hal', { exact: true })).toBeVisible()
    await expect(page.getByText('Helper', { exact: true })).toBeVisible()

    // Click on Hal agent
    await page.getByText('Hal', { exact: true }).first().click()

    // Agent detail view should show
    await expect(page.getByText('anthropic/claude-opus-4-6')).toBeVisible()
  })

  test('no selection shows home view', async ({ page }) => {
    await expect(page.getByText('OpenClaw Fleet Management')).toBeVisible()
    await expect(page.getByText('Machines')).toBeVisible()
  })
})

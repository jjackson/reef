import { test, expect } from '@playwright/test'
import { setupMockRoutes } from '../fixtures/mock-routes'

test.describe('Instance Detail', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockRoutes(page)
    await page.goto('/')
    // Navigate to instance detail
    await page.getByRole('button', { name: 'openclaw-hal' }).click()
  })

  test('displays instance header with label and IP', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'openclaw-hal' })).toBeVisible()
    await expect(page.getByText('167.71.100.1')).toBeVisible()
  })

  test('shows version from health check', async ({ page }) => {
    // InstanceDetail auto-fetches health on mount
    await expect(page.getByText('v2026.2.22-2')).toBeVisible()
  })

  test('restart service flow with confirmation', async ({ page }) => {
    await page.getByRole('button', { name: /Restart Service/ }).click()
    // Confirmation text appears
    await expect(page.getByText('Restart service?')).toBeVisible()

    await page.getByRole('button', { name: 'Confirm' }).click()
    // Success message
    await expect(page.getByText('Restarted successfully')).toBeVisible()
  })

  test('restart service can be cancelled', async ({ page }) => {
    await page.getByRole('button', { name: /Restart Service/ }).click()
    await expect(page.getByText('Restart service?')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    // Back to normal buttons
    await expect(page.getByRole('button', { name: /Restart Service/ })).toBeVisible()
  })

  test('reboot machine flow with confirmation', async ({ page }) => {
    await page.getByRole('button', { name: /Reboot Machine/ }).click()
    await expect(page.getByText('Reboot machine?')).toBeVisible()

    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByText(/reboot initiated/i)).toBeVisible()
  })
})

import { test, expect } from '@playwright/test'
import { setupMockRoutes } from '../fixtures/mock-routes'

test.describe('Agent Detail', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockRoutes(page)
    await page.goto('/')
    // Expand openclaw-hal and click on Hal agent
    const instanceRow = page.locator('.font-semibold', { hasText: 'openclaw-hal' }).locator('..')
    await instanceRow.locator('button').first().click()
    await expect(page.getByText('Hal', { exact: true })).toBeVisible()
    await page.getByText('Hal', { exact: true }).first().click()
  })

  test('displays agent header with name and model', async ({ page }) => {
    await expect(page.getByText('Hal', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('anthropic/claude-opus-4-6')).toBeVisible()
  })

  test('shows instance label in context', async ({ page }) => {
    await expect(page.getByText('openclaw-hal').first()).toBeVisible()
  })

  test('health action shows health data', async ({ page }) => {
    await page.getByRole('button', { name: 'Health' }).click()
    await expect(page.getByText('42M')).toBeVisible()
  })

  test('chat button navigates to chat view', async ({ page }) => {
    await page.getByRole('button', { name: 'Chat' }).click()
    // Chat panel shows agent name and instance
    await expect(page.getByText('@ openclaw-hal')).toBeVisible()
    await expect(page.getByText('Chat with Hal')).toBeVisible()
  })
})

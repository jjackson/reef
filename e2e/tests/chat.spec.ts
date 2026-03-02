import { test, expect } from '@playwright/test'
import { setupMockRoutes } from '../fixtures/mock-routes'

test.describe('Chat Panel', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockRoutes(page)
    await page.goto('/')
    // Navigate: expand instance → click agent → click Chat
    const instanceRow = page.locator('.font-semibold', { hasText: 'openclaw-hal' }).locator('..')
    await instanceRow.locator('button').first().click()
    await expect(page.getByText('Hal', { exact: true })).toBeVisible()
    await page.getByText('Hal', { exact: true }).first().click()
    await page.getByRole('button', { name: 'Chat' }).click()
  })

  test('shows chat header with agent name and instance', async ({ page }) => {
    await expect(page.getByText('Hal', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('@ openclaw-hal')).toBeVisible()
  })

  test('shows empty state message', async ({ page }) => {
    await expect(page.getByText('Chat with Hal')).toBeVisible()
    await expect(page.getByText(/Messages are sent via SSH/)).toBeVisible()
  })

  test('sending a message shows user message and streamed response', async ({ page }) => {
    const textarea = page.locator('textarea')
    await textarea.fill('Hello agent')
    await page.getByRole('button', { name: 'Send' }).click()

    // User message appears
    await expect(page.getByText('Hello agent')).toBeVisible()

    // Streamed agent response
    await expect(page.getByText('Hello from the agent!')).toBeVisible()
  })

  test('back button returns to agent detail', async ({ page }) => {
    await page.getByRole('button', { name: 'Back' }).click()
    // Should be back in agent detail view showing model info
    await expect(page.getByText('anthropic/claude-opus-4-6')).toBeVisible()
  })

  test('handles error response gracefully', async ({ page }) => {
    // Override chat route with error
    await page.route(/\/api\/instances\/[^/]+\/agents\/[^/]+\/chat$/, route =>
      route.fulfill({
        status: 500,
        json: { error: 'SSH connection failed' },
      })
    )

    const textarea = page.locator('textarea')
    await textarea.fill('Hello')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText(/SSH connection failed/)).toBeVisible()
  })
})

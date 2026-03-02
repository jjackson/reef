import { test, expect } from '@playwright/test'
import { setupMockRoutes } from '../fixtures/mock-routes'

test.describe('Fleet Panel', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockRoutes(page)
    await page.goto('/')

    // Expand both instances and load agents
    const halRow = page.locator('.font-semibold', { hasText: 'openclaw-hal' }).locator('..')
    await halRow.locator('button').first().click()
    await expect(page.getByText('Hal', { exact: true })).toBeVisible()

    const adaRow = page.locator('.font-semibold', { hasText: 'openclaw-ada' }).locator('..')
    await adaRow.locator('button').first().click()
    await expect(page.getByText('Ada', { exact: true })).toBeVisible()
  })

  test('checking 2+ agents switches to fleet view', async ({ page }) => {
    // Check Hal agent checkbox — text is nested 2 levels deep from the row with checkbox
    const halCheckbox = page.getByText('Hal', { exact: true }).locator('../..').locator('input[type="checkbox"]')
    await halCheckbox.check()

    // Check Ada agent checkbox
    const adaCheckbox = page.getByText('Ada', { exact: true }).locator('../..').locator('input[type="checkbox"]')
    await adaCheckbox.check()

    // Fleet panel should appear with selected count
    await expect(page.getByText(/2 agents selected/)).toBeVisible()
  })

  test('fleet action buttons are visible', async ({ page }) => {
    const halCheckbox = page.getByText('Hal', { exact: true }).locator('../..').locator('input[type="checkbox"]')
    await halCheckbox.check()
    const adaCheckbox = page.getByText('Ada', { exact: true }).locator('../..').locator('input[type="checkbox"]')
    await adaCheckbox.check()

    await expect(page.getByRole('button', { name: 'Health All' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hygiene All' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Backup All' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Broadcast' })).toBeVisible()
  })

  test('broadcast button shows message input', async ({ page }) => {
    const halCheckbox = page.getByText('Hal', { exact: true }).locator('../..').locator('input[type="checkbox"]')
    await halCheckbox.check()
    const adaCheckbox = page.getByText('Ada', { exact: true }).locator('../..').locator('input[type="checkbox"]')
    await adaCheckbox.check()

    await page.getByRole('button', { name: 'Broadcast' }).click()
    await expect(page.getByPlaceholder(/Enter a prompt/)).toBeVisible()
  })
})

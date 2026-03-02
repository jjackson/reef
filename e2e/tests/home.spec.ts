import { test, expect } from '@playwright/test'
import { setupMockRoutes } from '../fixtures/mock-routes'

test.describe('Home Panel', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockRoutes(page)
    await page.goto('/')
  })

  test('displays stats cards with correct counts', async ({ page }) => {
    await expect(page.getByText('Machines')).toBeVisible()
    await expect(page.getByText('Online')).toBeVisible()
    // Both instances have IPs, so Machines card should show "2"
    const machinesCard = page.getByText('Machines').locator('..')
    await expect(machinesCard.locator('.text-2xl')).toContainText('2')
  })

  test('shows instance list with labels and IPs', async ({ page }) => {
    await expect(page.getByText('openclaw-hal').first()).toBeVisible()
    await expect(page.getByText('167.71.100.1')).toBeVisible()
    await expect(page.getByText('openclaw-ada').first()).toBeVisible()
    await expect(page.getByText('167.71.100.2')).toBeVisible()
  })

  test('fleet overview button fetches and displays fleet data', async ({ page }) => {
    await page.getByRole('button', { name: 'Fleet Overview' }).click()

    // Wait for fleet data to load
    await expect(page.getByText('Instance Health')).toBeVisible()
    await expect(page.getByText('2026.2.22-2')).toBeVisible()
    await expect(page.getByText('Agents')).toBeVisible()
  })

  test('create machine button opens dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Machine' }).click()
    // The CreateMachineDialog should be visible
    await expect(page.getByText('Provision a new OpenClaw')).toBeVisible()
  })
})

import { Page } from '@playwright/test'
import * as data from './mock-data'

/**
 * Intercept all API routes with standard mock data.
 * Call before page.goto('/') in every test.
 * Override specific routes afterwards if needed (LIFO matching).
 */
export async function setupMockRoutes(page: Page) {
  // GET /api/accounts
  await page.route('**/api/accounts', route =>
    route.fulfill({ json: data.MOCK_ACCOUNTS })
  )

  // GET /api/instances (exact path only, not sub-routes)
  await page.route(/\/api\/instances\/?$/, route =>
    route.fulfill({ json: data.MOCK_INSTANCES })
  )

  // GET /api/workspaces
  await page.route(/\/api\/workspaces\/?$/, route =>
    route.fulfill({ json: data.MOCK_WORKSPACES })
  )

  // GET /api/instances/:id/agents (not sub-routes like /agents/:id/health)
  await page.route(/\/api\/instances\/openclaw-hal\/agents\/?$/, route =>
    route.fulfill({ json: data.MOCK_AGENTS_HAL })
  )

  await page.route(/\/api\/instances\/openclaw-ada\/agents\/?$/, route =>
    route.fulfill({ json: data.MOCK_AGENTS_ADA })
  )

  // POST /api/instances/:id/health
  await page.route(/\/api\/instances\/[^/]+\/health$/, route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ json: data.MOCK_HEALTH })
    }
    return route.continue()
  })

  // POST /api/instances/:id/restart
  await page.route(/\/api\/instances\/[^/]+\/restart$/, route =>
    route.fulfill({ json: { success: true, output: 'Restarted successfully' } })
  )

  // POST /api/instances/:id/reboot
  await page.route(/\/api\/instances\/[^/]+\/reboot$/, route =>
    route.fulfill({ json: { success: true } })
  )

  // GET /api/fleet/overview
  await page.route('**/api/fleet/overview', route =>
    route.fulfill({ json: data.MOCK_FLEET_OVERVIEW })
  )

  // POST /api/instances/:id/agents/:agentId/chat — SSE streaming
  await page.route(/\/api\/instances\/[^/]+\/agents\/[^/]+\/chat$/, route => {
    const sseBody = [
      `data: ${JSON.stringify({ chunk: 'Hello' })}\n\n`,
      `data: ${JSON.stringify({ chunk: ' from the agent!' })}\n\n`,
      `data: ${JSON.stringify({ done: true })}\n\n`,
    ].join('')

    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: sseBody,
    })
  })

  // POST /api/instances/:id/agents/:agentId/health
  await page.route(/\/api\/instances\/[^/]+\/agents\/[^/]+\/health$/, route =>
    route.fulfill({ json: data.MOCK_AGENT_HEALTH })
  )

  // POST /api/instances/:id/agents/:agentId/hygiene
  await page.route(/\/api\/instances\/[^/]+\/agents\/[^/]+\/hygiene$/, route =>
    route.fulfill({ json: { success: true } })
  )

  // POST /api/instances/:id/agents/:agentId/backup
  await page.route(/\/api\/instances\/[^/]+\/agents\/[^/]+\/backup$/, route =>
    route.fulfill({ json: { success: true, path: './backups/main-backup.tar.gz' } })
  )

  // GET /api/instances/:id/browse/read
  await page.route(/\/api\/instances\/[^/]+\/browse\/read/, route =>
    route.fulfill({ json: data.MOCK_FILE_CONTENT })
  )

  // GET /api/instances/:id/browse
  await page.route(/\/api\/instances\/[^/]+\/browse\/?$/, route =>
    route.fulfill({ json: data.MOCK_DIRECTORY })
  )

  // GET /api/instances/:id/channels/list
  await page.route(/\/api\/instances\/[^/]+\/channels\/list/, route =>
    route.fulfill({ json: { chat: { telegram: ['hal'] } } })
  )

  // POST /api/instances/:id/install
  await page.route(/\/api\/instances\/[^/]+\/install$/, route =>
    route.fulfill({ json: { success: true } })
  )

  // POST /api/instances/:id/google-setup
  await page.route(/\/api\/instances\/[^/]+\/google-setup$/, route =>
    route.fulfill({ json: { success: true } })
  )

  // GET /api/regions
  await page.route('**/api/regions*', route =>
    route.fulfill({ json: data.MOCK_REGIONS })
  )

  // GET /api/sizes
  await page.route('**/api/sizes*', route =>
    route.fulfill({ json: data.MOCK_SIZES })
  )

  // GET /api/ssh-keys
  await page.route('**/api/ssh-keys', route =>
    route.fulfill({ json: data.MOCK_SSH_KEYS })
  )
}

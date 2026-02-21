import { createClient } from '@1password/sdk'

// Module-level singleton — reused across requests in the same Node process.
// In Vercel serverless, each cold start creates a new client (acceptable).
let clientPromise: ReturnType<typeof createClient> | null = null

function getClient() {
  if (!clientPromise) {
    clientPromise = createClient({
      auth: process.env.OP_SERVICE_ACCOUNT_TOKEN!,
      integrationName: 'reef',
      integrationVersion: '1.0.0',
    })
  }
  return clientPromise
}

/**
 * Fetch a secret from 1Password by op:// reference.
 * Example ref: "op://AI-Agents/hal - SSH Private Key/private key"
 *
 * 1Password item naming convention: "<bot-name> - SSH Private Key"
 * The field name inside the item should be "private key".
 */
export async function getSecret(ref: string): Promise<string> {
  const client = await getClient()
  return client.secrets.resolve(ref)
}

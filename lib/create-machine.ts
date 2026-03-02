import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createProvider } from './providers'
import type { CloudProvider, CloudSize } from './providers/types'
import { getSecret, listSshKeyItems, createSshKeyItem } from './1password'
import { getBotName } from './mapping'
import { addToNameMap, loadSettings } from './settings'
import { promptChoice } from './prompts'

const OPENCLAW_PATTERN = /openclaw|open-claw/i
const DEFAULT_SIZE = 's-1vcpu-1gb' // $6/mo — 1 vCPU, 1GB RAM, 25GB SSD
const DEFAULT_REGION = 'nyc1'

async function shouldGenerateNewKey(): Promise<boolean> {
  const sshOptions = [
    { label: 'Generate new key pair', value: true },
    { label: 'Use existing key from 1Password', value: false },
  ]
  const choice = await promptChoice('SSH key setup:', sshOptions, o => o.label)
  return choice.value
}

function log(msg: string) {
  process.stderr.write(`${msg}\n`)
}

function formatSize(s: CloudSize): string {
  const ram = s.memory >= 1024 ? `${s.memory / 1024}GB` : `${s.memory}MB`
  return `${s.slug} — ${s.vcpus} vCPU, ${ram} RAM, ${s.disk}GB SSD — $${s.priceMonthly}/mo`
}

/** Derive the public key from a private key using ssh-keygen. */
function derivePublicKey(privateKey: string): string {
  const tmp = mkdtempSync(join(tmpdir(), 'reef-'))
  const keyPath = join(tmp, 'key')
  try {
    writeFileSync(keyPath, privateKey, { mode: 0o600 })
    return execSync(`ssh-keygen -y -f "${keyPath}"`, { encoding: 'utf-8' }).trim()
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** Generate a new ed25519 keypair. Returns { privateKey, publicKey }. */
function generateKeypair(comment: string): { privateKey: string; publicKey: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'reef-'))
  const keyPath = join(tmp, 'key')
  try {
    execSync(`ssh-keygen -t ed25519 -C "${comment}" -N "" -f "${keyPath}"`, { stdio: 'pipe' })
    const privateKey = readFileSync(keyPath, 'utf-8')
    const publicKey = readFileSync(`${keyPath}.pub`, 'utf-8').trim()
    return { privateKey, publicKey }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** Ensure a public key is registered in the cloud provider account. Returns the key ID. */
async function ensureSshKeyInProvider(
  provider: CloudProvider,
  name: string,
  publicKey: string,
): Promise<number | string> {
  const existing = await provider.listSshKeys()
  // Compare by key content (ignore comment suffix)
  const pubKeyBody = publicKey.split(' ').slice(0, 2).join(' ')
  const match = existing.find(k => k.publicKey.startsWith(pubKeyBody))
  if (match) {
    log(`SSH key already registered as "${match.name}"`)
    return match.id
  }
  log(`Adding SSH key "${name}" to cloud provider account...`)
  const added = await provider.addSshKey(name, publicKey)
  return added.id
}

/** Poll for instance IP, retrying every 5s for up to 2 minutes. */
async function waitForIp(provider: CloudProvider, providerId: string): Promise<string> {
  const maxAttempts = 24 // 24 * 5s = 2 min
  for (let i = 0; i < maxAttempts; i++) {
    const d = await provider.getInstance(providerId)
    if (d?.ip) return d.ip
    process.stderr.write('.')
    await new Promise(r => setTimeout(r, 5000))
  }
  throw new Error('Timed out waiting for instance IP address (2 minutes)')
}

export interface CreateMachineResult {
  success: true
  dropletName: string
  instanceId: string
  provider: string
  ip: string
  region: string
  size: string
  sshKeyName: string
}

export interface CreateMachineOptions {
  region?: string   // defaults to nyc1 when sshKey is also set (non-interactive)
  size?: string     // defaults to s-1vcpu-1gb ($6/mo) when sshKey is also set
  sshKey?: 'new' | string  // 'new' to generate, or 1Password item title to reuse
  accountId?: string  // which account to update in settings.json
}

export async function createMachine(dropletName: string, doToken: string, opts?: CreateMachineOptions): Promise<CreateMachineResult> {
  // Create provider from account settings
  const settings = loadSettings()
  const accountId = opts?.accountId || 'default'
  const accountConfig = settings.accounts[accountId]
  const provider = createProvider(accountConfig?.provider, doToken)

  // 1. Validate name
  if (!OPENCLAW_PATTERN.test(dropletName)) {
    throw new Error(`Droplet name must contain "openclaw" or "open-claw": ${dropletName}`)
  }

  // Check for existing instance with same name
  const existing = await provider.listInstances()
  if (existing.some(d => d.name === dropletName)) {
    throw new Error(`Droplet "${dropletName}" already exists`)
  }

  // Non-interactive when sshKey is specified — apply defaults
  const nonInteractive = !!opts?.sshKey
  const regionSlug = opts?.region || (nonInteractive ? DEFAULT_REGION : undefined)
  const sizeSlug = opts?.size || (nonInteractive ? DEFAULT_SIZE : undefined)

  // 2. Region picker
  const regions = await provider.listRegions()
  let region: typeof regions[0]
  if (regionSlug) {
    const match = regions.find(r => r.slug === regionSlug)
    if (!match) throw new Error(`Region "${regionSlug}" not found or not available`)
    region = match
  } else {
    region = await promptChoice('Select a region:', regions, r => `${r.slug} — ${r.name}`)
  }

  // 3. Size picker (filtered by region availability)
  const allSizes = await provider.listSizes()
  const sizes = allSizes.filter(s => s.regions.includes(region.slug))
  let size: CloudSize
  if (sizeSlug) {
    const match = sizes.find(s => s.slug === sizeSlug)
    if (!match) throw new Error(`Size "${sizeSlug}" not found or not available in ${region.slug}`)
    size = match
  } else {
    size = await promptChoice('Select a size:', sizes, (s) => formatSize(s))
  }

  // 4. SSH key setup
  let sshKeyId: number | string
  let sshKeyName: string

  const sshOpt = opts?.sshKey
  if (sshOpt === 'new' || (!sshOpt && (await shouldGenerateNewKey()))) {
    // Generate new keypair
    const botName = getBotName(dropletName) || dropletName
    const capitalized = botName.charAt(0).toUpperCase() + botName.slice(1)
    const comment = `${dropletName}@reef`
    const { privateKey, publicKey } = generateKeypair(comment)

    // Save to 1Password
    log(`Saving SSH key to 1Password as "${capitalized} - SSH Key"...`)
    const opItem = await createSshKeyItem(capitalized, privateKey)
    sshKeyName = opItem.title

    // Add to provider
    sshKeyId = await ensureSshKeyInProvider(provider, sshKeyName, publicKey)
  } else {
    // Use existing key from 1Password
    const items = await listSshKeyItems()
    if (items.length === 0) throw new Error('No SSH key items found in 1Password AI-Agents vault')

    let item: typeof items[0]
    if (sshOpt && sshOpt !== 'new') {
      const match = items.find(i => i.title === sshOpt)
      if (!match) throw new Error(`SSH key "${sshOpt}" not found in 1Password`)
      item = match
    } else {
      item = await promptChoice('Select an SSH key from 1Password:', items, i => i.title)
    }
    sshKeyName = item.title

    // Resolve the private key and derive the public key
    const ref = `op://AI-Agents/${item.title}/private key`
    const privateKey = await getSecret(ref)
    const publicKey = derivePublicKey(privateKey)
    sshKeyId = await ensureSshKeyInProvider(provider, item.title, publicKey)
  }

  // 5. Create instance
  log(`\nCreating instance "${dropletName}" in ${region.slug}...`)
  const instance = await provider.createInstance({
    name: dropletName,
    region: region.slug,
    size: size.slug,
    image: 'ubuntu-24-04-x64',
    sshKeyIds: [sshKeyId],
    tags: ['openclaw'],
  })

  // 6. Poll for IP
  process.stderr.write('Waiting for IP address')
  const ip = await waitForIp(provider, instance.providerId)
  log('')

  // 7. Update settings.json name map
  const botName = getBotName(dropletName) || dropletName
  const capitalized = botName.charAt(0).toUpperCase() + botName.slice(1)
  addToNameMap(accountId, dropletName, capitalized)

  return {
    success: true,
    dropletName,
    instanceId: instance.providerId,
    provider: provider.type,
    ip,
    region: region.slug,
    size: size.slug,
    sshKeyName,
  }
}

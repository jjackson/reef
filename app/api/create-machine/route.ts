import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getSecret, createSshKeyItem } from '@/lib/1password'
import {
  listOpenClawDroplets,
  listAccountSshKeys,
  addAccountSshKey,
  createDroplet,
  getDroplet,
} from '@/lib/digitalocean'
import { getBotName } from '@/lib/mapping'
import { getAccountToken } from '@/lib/instances'
import { getAccounts, addToNameMap } from '@/lib/settings'

const OPENCLAW_PATTERN = /openclaw|open-claw/i

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

async function ensureSshKeyInDO(token: string, name: string, publicKey: string): Promise<number> {
  const existing = await listAccountSshKeys(token)
  const pubKeyBody = publicKey.split(' ').slice(0, 2).join(' ')
  const match = existing.find(k => k.public_key.startsWith(pubKeyBody))
  if (match) return match.id
  const added = await addAccountSshKey(token, name, publicKey)
  return added.id
}

async function waitForIp(token: string, dropletId: number): Promise<string> {
  const maxAttempts = 24
  for (let i = 0; i < maxAttempts; i++) {
    const d = await getDroplet(token, dropletId)
    if (d.ip) return d.ip
    await new Promise(r => setTimeout(r, 5000))
  }
  throw new Error('Timed out waiting for droplet IP address (2 minutes)')
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, region, size, sshKeyTitle, generateKey } = body

    // Determine account: use provided accountId, fall back to first configured, then 'default'
    const accounts = getAccounts()
    const accountId = body.accountId || (accounts.length > 0 ? accounts[0].id : 'default')

    if (!name || !region || !size) {
      return NextResponse.json({ error: 'Missing required fields: name, region, size' }, { status: 400 })
    }

    if (!OPENCLAW_PATTERN.test(name)) {
      return NextResponse.json({ error: 'Droplet name must contain "openclaw" or "open-claw"' }, { status: 400 })
    }

    const token = await getAccountToken(accountId)

    // Check for existing droplet with same name
    const existing = await listOpenClawDroplets(token)
    if (existing.some(d => d.name === name)) {
      return NextResponse.json({ error: `Droplet "${name}" already exists` }, { status: 409 })
    }

    let sshKeyDoId: number
    let sshKeyName: string

    if (generateKey) {
      // Generate new keypair
      const botName = getBotName(name) || name
      const capitalized = botName.charAt(0).toUpperCase() + botName.slice(1)
      const comment = `${name}@reef`
      const { privateKey, publicKey } = generateKeypair(comment)
      const opItem = await createSshKeyItem(capitalized, privateKey)
      sshKeyName = opItem.title
      sshKeyDoId = await ensureSshKeyInDO(token, sshKeyName, publicKey)
    } else if (sshKeyTitle) {
      // Use existing key from 1Password
      sshKeyName = sshKeyTitle
      const ref = `op://AI-Agents/${sshKeyTitle}/private key`
      const privateKey = await getSecret(ref)
      const publicKey = derivePublicKey(privateKey)
      sshKeyDoId = await ensureSshKeyInDO(token, sshKeyTitle, publicKey)
    } else {
      return NextResponse.json({ error: 'Either sshKeyTitle or generateKey must be provided' }, { status: 400 })
    }

    // Create the droplet
    const droplet = await createDroplet(token, {
      name,
      region,
      size,
      image: 'ubuntu-24-04-x64',
      ssh_keys: [sshKeyDoId],
      tags: ['openclaw'],
    })

    // Poll for IP
    const ip = await waitForIp(token, droplet.id)

    // Update name map in settings
    const botName = getBotName(name) || name
    const capitalized = botName.charAt(0).toUpperCase() + botName.slice(1)
    addToNameMap(accountId, name, capitalized)

    return NextResponse.json({
      success: true,
      dropletName: name,
      dropletId: droplet.id,
      ip,
      region,
      size,
      sshKeyName,
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

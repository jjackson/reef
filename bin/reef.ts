#!/usr/bin/env -S npx tsx
import { loadEnv } from '../lib/env'
import { listInstances, resolveInstance } from '../lib/instances'
import {
  getHealth,
  listAgents,
  getStatus,
  runDoctor,
  restartOpenClaw,
  backupAgent,
  deployAgent,
  sendChatMessage,
  getAgentHealth,
  runAgentHygieneCheck,
} from '../lib/openclaw'
import { existsSync } from 'fs'
import { resolve, join } from 'path'
import { execSync } from 'child_process'

loadEnv()

const [, , command, ...args] = process.argv

function fail(error: string): never {
  console.error(JSON.stringify({ success: false, error }))
  process.exit(1)
}

async function requireInstance(id: string) {
  const instance = await resolveInstance(id)
  if (!instance) fail(`Instance not found: ${id}`)
  return instance
}

function sshConfig(instance: { ip: string; sshKey: string }) {
  return { host: instance.ip, privateKey: instance.sshKey }
}

async function main() {
  switch (command) {
    case 'instances': {
      const instances = await listInstances()
      console.log(JSON.stringify({
        success: true,
        instances: instances.map(i => ({ id: i.id, label: i.label, ip: i.ip })),
      }))
      break
    }

    case 'health': {
      const instance = await requireInstance(args[0])
      const health = await getHealth(sshConfig(instance))
      console.log(JSON.stringify({ success: true, ...health }))
      break
    }

    case 'agents': {
      const instance = await requireInstance(args[0])
      const agents = await listAgents(sshConfig(instance))
      console.log(JSON.stringify({ success: true, agents }))
      break
    }

    case 'status': {
      const instance = await requireInstance(args[0])
      const status = await getStatus(sshConfig(instance))
      console.log(JSON.stringify({ success: true, ...status }))
      break
    }

    case 'doctor': {
      const instance = await requireInstance(args[0])
      const result = await runDoctor(sshConfig(instance))
      console.log(JSON.stringify({ success: true, ...result }))
      break
    }

    case 'restart': {
      const instance = await requireInstance(args[0])
      const result = await restartOpenClaw(sshConfig(instance))
      console.log(JSON.stringify(result))
      break
    }

    case 'backup': {
      const [instanceId, agentId] = args
      if (!agentId) fail('Usage: reef backup <instance> <agent>')
      const instance = await requireInstance(instanceId)
      const backupDir = resolve('backups')
      if (!existsSync(backupDir)) {
        const { mkdirSync } = await import('fs')
        mkdirSync(backupDir, { recursive: true })
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const tarPath = join(backupDir, `${instanceId}-${agentId}-${timestamp}.tar.gz`)
      await backupAgent(sshConfig(instance), agentId, tarPath)
      console.log(JSON.stringify({ success: true, path: tarPath }))
      break
    }

    case 'check-backup': {
      const tarPath = args[0]
      if (!tarPath || !existsSync(tarPath)) fail(`Tarball not found: ${tarPath}`)
      try {
        const listing = execSync(`tar -tzf "${tarPath}"`, { encoding: 'utf-8' })
        const files = listing.trim().split('\n').filter(Boolean)
        const { statSync } = await import('fs')
        const size = statSync(tarPath).size
        console.log(JSON.stringify({ success: true, files, fileCount: files.length, sizeBytes: size }))
      } catch (e) {
        fail(`Tarball corrupt or unreadable: ${e instanceof Error ? e.message : e}`)
      }
      break
    }

    case 'deploy': {
      const [instanceId, agentId, tarPath] = args
      if (!tarPath) fail('Usage: reef deploy <instance> <agent> <tarball>')
      if (!existsSync(tarPath)) fail(`Tarball not found: ${tarPath}`)
      const instance = await requireInstance(instanceId)
      const result = await deployAgent(sshConfig(instance), agentId, tarPath)
      console.log(JSON.stringify(result))
      break
    }

    case 'chat': {
      const [instanceId, agentId, ...messageParts] = args
      const message = messageParts.join(' ')
      if (!message) fail('Usage: reef chat <instance> <agent> <message>')
      const instance = await requireInstance(instanceId)
      const result = await sendChatMessage(sshConfig(instance), agentId, message)
      console.log(JSON.stringify({ success: true, ...result }))
      break
    }

    case 'agent-health': {
      const [instanceId, agentId] = args
      if (!agentId) fail('Usage: reef agent-health <instance> <agent>')
      const instance = await requireInstance(instanceId)
      const result = await getAgentHealth(sshConfig(instance), agentId)
      console.log(JSON.stringify({ success: true, ...result }))
      break
    }

    case 'agent-hygiene': {
      const [instanceId, agentId] = args
      if (!agentId) fail('Usage: reef agent-hygiene <instance> <agent>')
      const instance = await requireInstance(instanceId)
      const result = await runAgentHygieneCheck(sshConfig(instance), agentId)
      console.log(JSON.stringify({ success: true, ...result }))
      break
    }

    default:
      fail(`Unknown command: ${command ?? '(none)'}. Commands: instances, health, agents, status, doctor, restart, backup, check-backup, deploy, chat, agent-health, agent-hygiene`)
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err))
})

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
  listChannels,
  addChannel,
  bindChannel,
  createAgent,
  deleteAgent,
  approvePairing,
  listPairingRequests,
  listDirectory,
  readRemoteFile,
  setApiKey,
} from '../lib/openclaw'
import { runCommand } from '../lib/ssh'
import { createMachine } from '../lib/create-machine'
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
        instances: instances.map(i => ({ id: i.id, label: i.label, ip: i.ip, account: i.accountId })),
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

    case 'channels': {
      const instance = await requireInstance(args[0])
      const channels = await listChannels(sshConfig(instance))
      console.log(JSON.stringify({ success: true, ...channels }))
      break
    }

    case 'add-channel': {
      const [instanceId, channel, token, accountId] = args
      if (!token) fail('Usage: reef add-channel <instance> <channel-type> <token> [account-id]')
      const instance = await requireInstance(instanceId)
      const result = await addChannel(sshConfig(instance), channel, token, accountId)
      console.log(JSON.stringify(result))
      break
    }

    case 'bind-channel': {
      const [instanceId, agentId, channel, accountId] = args
      if (!channel) fail('Usage: reef bind-channel <instance> <agent> <channel> [account-id]')
      const instance = await requireInstance(instanceId)
      const result = await bindChannel(sshConfig(instance), agentId, channel, accountId)
      console.log(JSON.stringify(result))
      break
    }

    case 'create-agent': {
      const [instanceId, name, ...rest] = args
      if (!name) fail('Usage: reef create-agent <instance> <name> [--model <model>]')
      const instance = await requireInstance(instanceId)
      const modelIdx = rest.indexOf('--model')
      const model = modelIdx >= 0 ? rest[modelIdx + 1] : undefined
      const result = await createAgent(sshConfig(instance), name, { model })
      console.log(JSON.stringify(result))
      break
    }

    case 'delete-agent': {
      const [instanceId, agentId] = args
      if (!agentId) fail('Usage: reef delete-agent <instance> <agent>')
      const instance = await requireInstance(instanceId)
      const result = await deleteAgent(sshConfig(instance), agentId)
      console.log(JSON.stringify(result))
      break
    }

    case 'approve-pairing': {
      const [instanceId, channel, code] = args
      if (!code) fail('Usage: reef approve-pairing <instance> <channel> <code>')
      const instance = await requireInstance(instanceId)
      const result = await approvePairing(sshConfig(instance), channel, code)
      console.log(JSON.stringify(result))
      break
    }

    case 'pairing-requests': {
      const [instanceId, channel] = args
      if (!channel) fail('Usage: reef pairing-requests <instance> <channel>')
      const instance = await requireInstance(instanceId)
      const result = await listPairingRequests(sshConfig(instance), channel)
      console.log(JSON.stringify(result))
      break
    }

    case 'ls': {
      const [instanceId, remotePath] = args
      if (!remotePath) fail('Usage: reef ls <instance> <path>')
      const instance = await requireInstance(instanceId)
      const entries = await listDirectory(sshConfig(instance), remotePath)
      console.log(JSON.stringify({ success: true, entries }))
      break
    }

    case 'cat': {
      const [instanceId, remotePath] = args
      if (!remotePath) fail('Usage: reef cat <instance> <path>')
      const instance = await requireInstance(instanceId)
      const content = await readRemoteFile(sshConfig(instance), remotePath)
      console.log(JSON.stringify({ success: true, content }))
      break
    }

    case 'ssh': {
      const [instanceId, ...cmdParts] = args
      const cmd = cmdParts.join(' ')
      if (!cmd) fail('Usage: reef ssh <instance> <command>')
      const instance = await requireInstance(instanceId)
      const result = await runCommand(sshConfig(instance), cmd)
      console.log(JSON.stringify({
        success: result.code === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
      }))
      break
    }

    case 'set-key': {
      const [instanceId, key, ...rest] = args
      if (!key) fail('Usage: reef set-key <instance> <api-key> [--agent <agent>] [--provider <provider>] [--restart]')
      const instance = await requireInstance(instanceId)
      const agentIdx = rest.indexOf('--agent')
      const agentId = agentIdx >= 0 ? rest[agentIdx + 1] : 'main'
      const providerIdx = rest.indexOf('--provider')
      const provider = providerIdx >= 0 ? rest[providerIdx + 1] : 'anthropic'
      const restart = rest.includes('--restart')
      const result = await setApiKey(sshConfig(instance), agentId, key, { provider, restart })
      console.log(JSON.stringify(result))
      break
    }

    case 'logs': {
      const [instanceId, ...rest] = args
      if (!instanceId) fail('Usage: reef logs <instance> [--lines N] [--agent <agent>]')
      const instance = await requireInstance(instanceId)
      const linesIdx = rest.indexOf('--lines')
      const lines = linesIdx >= 0 ? parseInt(rest[linesIdx + 1]) || 50 : 50
      const agentIdx = rest.indexOf('--agent')
      const agentFilter = agentIdx >= 0 ? rest[agentIdx + 1] : undefined
      let cmd = `journalctl --user -u openclaw-gateway --no-pager -n ${lines} 2>&1`
      if (agentFilter) {
        cmd += ` | grep -i '${agentFilter.replace(/'/g, "'\\''")}'`
      }
      const result = await runCommand(sshConfig(instance), cmd)
      console.log(JSON.stringify({
        success: true,
        output: result.stdout + result.stderr,
        lines,
      }))
      break
    }

    case 'migrate-ssh-keys': {
      const { migrateSshKeysToSshKeyType } = await import('../lib/1password')
      const result = await migrateSshKeysToSshKeyType()
      console.log(JSON.stringify({ success: true, ...result }))
      break
    }

    case 'create-machine': {
      const [name, ...rest] = args
      if (!name) fail('Usage: reef create-machine <droplet-name> [--account <name>] [--region <slug>] [--size <slug>] [--ssh-key new|<1pass-title>]')
      const regionIdx = rest.indexOf('--region')
      const sizeIdx = rest.indexOf('--size')
      const sshKeyIdx = rest.indexOf('--ssh-key')
      const accountIdx = rest.indexOf('--account')
      const accountId = accountIdx >= 0 ? rest[accountIdx + 1] : undefined

      const { getAccountToken } = await import('../lib/instances')
      const doToken = await getAccountToken(accountId || 'default')

      const result = await createMachine(name, doToken, {
        region: regionIdx >= 0 ? rest[regionIdx + 1] : undefined,
        size: sizeIdx >= 0 ? rest[sizeIdx + 1] : undefined,
        sshKey: sshKeyIdx >= 0 ? rest[sshKeyIdx + 1] : undefined,
        accountId,
      })
      console.log(JSON.stringify(result))
      break
    }

    case 'help': {
      const commands = [
        'Instance commands:',
        '  instances                              List all discovered instances',
        '  health <instance>                      Process status, disk, memory, uptime',
        '  agents <instance>                      List agents on an instance',
        '  status <instance>                      Deep diagnostics (openclaw status --all --deep)',
        '  doctor <instance>                      Run openclaw doctor to auto-fix issues',
        '  restart <instance>                     Restart OpenClaw service',
        '  channels <instance>                    List configured channels',
        '  logs <instance> [--lines N] [--agent X] View service logs',
        '',
        'Agent commands:',
        '  agent-health <instance> <agent>        Agent directory, size, activity, process',
        '  chat <instance> <agent> <message>      Send message, get JSON response',
        '  create-agent <instance> <name> [--model M]  Create new agent',
        '  delete-agent <instance> <agent>        Delete an agent',
        '',
        'Config commands:',
        '  set-key <instance> <key> [--agent A] [--provider P] [--restart]  Set API key',
        '',
        'Channel commands:',
        '  add-channel <instance> <type> <token> [account]  Add a channel',
        '  bind-channel <instance> <agent> <channel> [account]  Bind channel to agent',
        '  approve-pairing <instance> <channel> <code>  Approve user pairing',
        '  pairing-requests <instance> <channel>  List pending pairing requests',
        '',
        'Backup & deploy:',
        '  backup <instance> <agent>              Download agent tarball',
        '  check-backup <tarball>                 Verify tarball integrity',
        '  deploy <instance> <agent> <tarball>    Deploy agent from tarball',
        '',
        'Machine provisioning:',
        '  create-machine <name> [--account A] [--region R] [--size S] [--ssh-key new|<title>]',
        '                                         Provision new DO droplet with SSH key',
        '',
        'Migration:',
        '  migrate-ssh-keys                       Migrate SSH keys from Secure Notes to SshKey items',
        '',
        'Remote access:',
        '  ssh <instance> <command>               Run arbitrary SSH command',
        '  ls <instance> <path>                   List remote directory',
        '  cat <instance> <path>                  Read remote file',
      ]
      console.log(commands.join('\n'))
      break
    }

    default:
      fail(`Unknown command: ${command ?? '(none)'}. Run 'reef help' for usage.`)
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err))
})

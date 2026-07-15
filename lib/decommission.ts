import { execSync } from 'child_process'
import { statSync } from 'fs'
import { join } from 'path'
import type { ResolvedInstance } from './instances'
import { getAccountToken } from './instances'
import { createProvider } from './providers'
import { extractInstance, backupFullInstance } from './openclaw'
import { removeInstanceFromSettings } from './workspaces'

export interface DecommissionResult {
  success: boolean
  instance: string
  steps: {
    backup?: {
      success: boolean
      extractDir?: string
      fullBackupPath?: string
      fullBackupBytes?: number
      agents?: string[]
      errors?: string[]
    }
    powerOff?: { success: boolean; error?: string }
    destroy?: { success: boolean; error?: string }
    settingsCleanup?: { success: boolean; error?: string }
  }
  error?: string
}

function verifyTarball(tarPath: string): number {
  execSync(`tar -tzf "${tarPath}" > /dev/null`, { encoding: 'utf-8' })
  return statSync(tarPath).size
}

/**
 * Decommissions an instance: backs up all agents + channel config, powers
 * off and destroys the droplet (billing stops at destroy), and removes the
 * instance from config/settings.json. The destroy only runs if the backup
 * verifies, unless skipBackup is set. Pass fullBackup to also pull a
 * tarball of the entire ~/.openclaw directory (large, slow).
 */
export async function decommissionInstance(
  instance: ResolvedInstance,
  backupDir: string,
  options?: { skipBackup?: boolean; fullBackup?: boolean }
): Promise<DecommissionResult> {
  const result: DecommissionResult = {
    success: false,
    instance: instance.id,
    steps: {},
  }
  const ssh = { host: instance.ip, privateKey: instance.sshKey }

  if (!options?.skipBackup) {
    const extract = await extractInstance(ssh, instance.id, backupDir)
    const errors = [...extract.errors]
    // Verify every agent tarball before we let anything get destroyed
    for (const agent of extract.agents) {
      try {
        verifyTarball(join(extract.extractDir, 'agents', `${agent}.tar.gz`))
      } catch (err) {
        errors.push(`Agent tarball ${agent} failed verification: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    let fullBackupPath: string | undefined
    let fullBackupBytes: number | undefined
    if (options?.fullBackup) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      fullBackupPath = join(backupDir, `${instance.id}-full-${timestamp}.tar.gz`)
      try {
        await backupFullInstance(ssh, fullBackupPath)
        fullBackupBytes = verifyTarball(fullBackupPath)
      } catch (err) {
        errors.push(`Full backup failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    result.steps.backup = {
      success: errors.length === 0,
      extractDir: extract.extractDir,
      fullBackupPath,
      fullBackupBytes,
      agents: extract.agents,
      errors,
    }
    if (errors.length > 0) {
      result.error = 'Backup did not complete cleanly; droplet NOT destroyed. Fix the backup or pass --skip-backup.'
      return result
    }
  }

  const token = await getAccountToken(instance.accountId)
  const provider = createProvider(instance.provider, token)

  // Best effort — destroy is what actually stops billing
  result.steps.powerOff = await provider.powerOffInstance(instance.providerId)

  result.steps.destroy = await provider.destroyInstance(instance.providerId)
  if (!result.steps.destroy.success) {
    result.error = `Destroy failed: ${result.steps.destroy.error}`
    return result
  }

  try {
    removeInstanceFromSettings(instance.id)
    result.steps.settingsCleanup = { success: true }
  } catch (err) {
    result.steps.settingsCleanup = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  result.success = true
  return result
}

import { Client } from 'ssh2'

export interface SshConfig {
  host: string
  privateKey: string
  username?: string
  port?: number
}

export interface CommandResult {
  stdout: string
  stderr: string
  code: number
}

/**
 * Opens an SSH connection, runs a single command, closes the connection.
 * Per-request — no connection pooling needed at 0-10 instance scale.
 */
export async function runCommand(
  config: SshConfig,
  command: string
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client()

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end()
            return reject(err)
          }

          let stdout = ''
          let stderr = ''

          stream
            .on('close', (code: number) => {
              conn.end()
              resolve({ stdout, stderr, code })
            })
            .on('data', (data: Buffer) => {
              stdout += data.toString()
            })
            .stderr.on('data', (data: Buffer) => {
              stderr += data.toString()
            })
        })
      })
      .on('error', reject)
      .connect({
        host: config.host,
        port: config.port ?? 22,
        username: config.username ?? 'root',
        privateKey: config.privateKey,
      })
  })
}

/**
 * SFTP-pulls a single file from the remote machine to a local path.
 */
export async function sftpPull(
  config: SshConfig,
  remotePath: string,
  localPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = new Client()

    conn
      .on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end()
            return reject(err)
          }
          sftp.fastGet(remotePath, localPath, (err) => {
            conn.end()
            if (err) reject(err)
            else resolve()
          })
        })
      })
      .on('error', reject)
      .connect({
        host: config.host,
        port: config.port ?? 22,
        username: config.username ?? 'root',
        privateKey: config.privateKey,
      })
  })
}

/**
 * Tars a remote directory and SFTP-pulls the archive to localTarPath.
 */
export async function backupDirectory(
  config: SshConfig,
  remoteDir: string,
  localTarPath: string
): Promise<void> {
  const tmpPath = '/tmp/reef-backup.tar.gz'
  await runCommand(
    config,
    `tar -czf ${tmpPath} -C $(dirname ${remoteDir}) $(basename ${remoteDir})`
  )
  await sftpPull(config, tmpPath, localTarPath)
  await runCommand(config, `rm ${tmpPath}`)
}

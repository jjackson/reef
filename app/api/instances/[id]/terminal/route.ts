import { resolveInstance } from '@/lib/instances'
import { Client } from 'ssh2'

export function GET() {
  return new Response('WebSocket endpoint', { status: 426, headers: { Upgrade: 'websocket' } })
}

export function UPGRADE(
  client: import('ws').WebSocket,
  _server: import('ws').WebSocketServer,
  request: import('next/server').NextRequest
) {
  const url = new URL(request.url)
  const segments = url.pathname.split('/')
  const idIndex = segments.indexOf('instances') + 1
  const id = segments[idIndex]

  if (!id) {
    client.close(1008, 'Missing instance ID')
    return
  }

  const existingSession = url.searchParams.get('session')
  const initialCommand = url.searchParams.get('command')

  let sshConn: Client | null = null
  let sshStream: import('ssh2').ClientChannel | null = null

  resolveInstance(id).then(instance => {
    if (!instance) {
      client.send(JSON.stringify({ type: 'error', data: 'Instance not found' }))
      client.close(1008, 'Instance not found')
      return
    }

    sshConn = new Client()

    sshConn.on('ready', () => {
      const cols = 80
      const rows = 24

      if (existingSession) {
        // Reattach to existing tmux session
        sshConn!.shell(
          { cols, rows, term: 'xterm-256color' },
          (err, stream) => {
            if (err) {
              client.send(JSON.stringify({ type: 'error', data: err.message }))
              client.close(1011, 'SSH shell error')
              return
            }
            sshStream = stream
            wireStream(client, stream, sshConn!)

            stream.write(`tmux attach -t ${existingSession}\n`)
            client.send(JSON.stringify({ type: 'session', name: existingSession }))
          }
        )
      } else {
        // Create new tmux session
        const sessionName = `reef-${Date.now()}`

        sshConn!.shell(
          { cols, rows, term: 'xterm-256color' },
          (err, stream) => {
            if (err) {
              client.send(JSON.stringify({ type: 'error', data: err.message }))
              client.close(1011, 'SSH shell error')
              return
            }
            sshStream = stream
            wireStream(client, stream, sshConn!)

            const createCmd = `tmux new-session -d -s ${sessionName} -x ${cols} -y ${rows}`
            if (initialCommand) {
              const escaped = initialCommand.replace(/'/g, "'\\''")
              stream.write(`${createCmd} && tmux send-keys -t ${sessionName} '${escaped}' Enter && tmux attach -t ${sessionName}\n`)
            } else {
              stream.write(`${createCmd} && tmux attach -t ${sessionName}\n`)
            }
            client.send(JSON.stringify({ type: 'session', name: sessionName }))
          }
        )
      }
    })

    sshConn.on('error', (err) => {
      client.send(JSON.stringify({ type: 'error', data: err.message }))
      if (client.readyState === client.OPEN) {
        client.close(1011, 'SSH connection error')
      }
    })

    sshConn.connect({
      host: instance.ip,
      port: 22,
      username: 'root',
      privateKey: instance.sshKey,
    })
  }).catch(err => {
    client.send(JSON.stringify({ type: 'error', data: err.message }))
    client.close(1011, 'Failed to resolve instance')
  })

  client.on('close', () => {
    if (sshStream) {
      sshStream.close()
      sshStream = null
    }
    if (sshConn) {
      sshConn.end()
      sshConn = null
    }
  })
}

function wireStream(
  client: import('ws').WebSocket,
  stream: import('ssh2').ClientChannel,
  conn: Client
) {
  stream.on('data', (data: Buffer) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({ type: 'data', data: data.toString('utf-8') }))
    }
  })

  stream.on('close', () => {
    if (client.readyState === client.OPEN) {
      client.close(1000, 'SSH session ended')
    }
    conn.end()
  })

  client.on('message', (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
      if (msg.type === 'data' && typeof msg.data === 'string') {
        stream.write(msg.data)
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        stream.setWindow(msg.rows, msg.cols, 0, 0)
      }
    } catch {
      // ignore malformed messages
    }
  })
}

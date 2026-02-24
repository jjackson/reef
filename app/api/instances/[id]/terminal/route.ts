import { resolveInstance } from '@/lib/instances'
import { Client } from 'ssh2'

// GET export required for Next.js to register this route (next-ws intercepts the upgrade)
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
  // pathname: /api/instances/<id>/terminal
  const idIndex = segments.indexOf('instances') + 1
  const id = segments[idIndex]

  if (!id) {
    client.close(1008, 'Missing instance ID')
    return
  }

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
      sshConn!.shell(
        { cols: 80, rows: 24, term: 'xterm-256color' },
        (err, stream) => {
          if (err) {
            client.send(JSON.stringify({ type: 'error', data: err.message }))
            client.close(1011, 'SSH shell error')
            return
          }

          sshStream = stream

          // SSH stdout → WebSocket
          stream.on('data', (data: Buffer) => {
            if (client.readyState === client.OPEN) {
              client.send(JSON.stringify({ type: 'data', data: data.toString('utf-8') }))
            }
          })

          // SSH stream close → close WebSocket
          stream.on('close', () => {
            if (client.readyState === client.OPEN) {
              client.close(1000, 'SSH session ended')
            }
            sshConn?.end()
          })

          // WebSocket messages → SSH stdin or resize
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
      )
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

  // Cleanup on WebSocket close
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

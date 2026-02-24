import { resolveInstance } from '@/lib/instances'
import { execStream } from '@/lib/ssh'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const config = { host: instance.ip, privateKey: instance.sshKey }

    // Single chained command so we can stream all output
    const cmd = [
      'echo "=== Upgrading OpenClaw ==="',
      'npm update -g openclaw 2>&1',
      'echo ""',
      'echo "=== Restarting Gateway ==="',
      'openclaw gateway restart 2>&1',
      'echo ""',
      'echo "=== Version ==="',
      'openclaw --version 2>&1',
    ].join(' && ')

    const { stream, done } = execStream(config, cmd)

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk.toString())}\n\n`))
        })
        stream.on('end', () => {
          done.then((code) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, exitCode: code })}\n\n`))
            controller.close()
          }).catch(() => {
            controller.close()
          })
        })
        stream.on('error', (err: Error) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, error: err.message })}\n\n`))
          controller.close()
        })
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

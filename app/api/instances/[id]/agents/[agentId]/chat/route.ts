import { resolveInstance } from '@/lib/instances'
import { streamChatMessage } from '@/lib/openclaw'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id, agentId } = await params
  try {
    const { message } = await req.json()
    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const instance = await resolveInstance(id)
    if (!instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { stream, done } = streamChatMessage(
      { host: instance.ip, privateKey: instance.sshKey },
      agentId,
      message
    )

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        stream.on('data', (chunk: Buffer) => {
          const text = chunk.toString()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: text })}\n\n`))
        })

        stream.on('end', () => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
          controller.close()
        })

        stream.on('error', (err) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`))
          controller.close()
        })

        // Ensure we clean up if the client disconnects
        done.catch(() => {})
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

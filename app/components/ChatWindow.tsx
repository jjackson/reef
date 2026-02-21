'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface Message {
  role: 'user' | 'agent'
  content: string
  timestamp: string
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1 px-1">
      <span className="thinking-dot w-1.5 h-1.5 rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
      <span className="thinking-dot w-1.5 h-1.5 rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
      <span className="thinking-dot w-1.5 h-1.5 rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
    </div>
  )
}

interface ChatWindowProps {
  instanceId: string
  agentId: string
  agentName: string
  agentEmoji?: string
  initialMessage?: string
}

export function ChatWindow({ instanceId, agentId, agentName, agentEmoji, initialMessage }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const initialSent = useRef(false)

  const displayName = agentName || 'agent'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !instanceId || !agentId) return

    const userMsg: Message = {
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)

    const agentMsg: Message = {
      role: 'agent',
      content: '',
      timestamp: new Date().toLocaleTimeString(),
    }
    setMessages(prev => [...prev, agentMsg])

    try {
      const res = await fetch(`/api/instances/${instanceId}/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content }),
      })

      if (!res.ok) {
        const data = await res.json()
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { ...agentMsg, content: `Error: ${data.error}` }
          return updated
        })
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No response body')

      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.chunk) {
              accumulated += data.chunk
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { ...agentMsg, content: accumulated }
                return updated
              })
            }
            if (data.error) {
              accumulated += `\nError: ${data.error}`
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { ...agentMsg, content: accumulated }
                return updated
              })
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (e) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...agentMsg,
          content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`,
        }
        return updated
      })
    } finally {
      setSending(false)
    }
  }, [instanceId, agentId])

  useEffect(() => {
    if (initialMessage && !initialSent.current) {
      initialSent.current = true
      sendMessage(initialMessage)
    }
  }, [initialMessage, sendMessage])

  function send() {
    if (sending) return
    sendMessage(input)
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 && !initialMessage && (
          <div className="text-center pt-12">
            <div className="text-3xl mb-2 opacity-30">{agentEmoji || '\u2709'}</div>
            <p className="text-sm text-slate-400">Chat with {displayName}</p>
            <p className="text-xs text-slate-300 mt-1">Messages are sent via SSH to the OpenClaw agent</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          const isThinking = !isUser && msg.content === '' && sending

          return (
            <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && agentEmoji && (
                <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-xs mr-2 mt-0.5 shrink-0">
                  {agentEmoji}
                </div>
              )}
              <div
                className={`max-w-lg rounded-xl px-4 py-2.5 text-sm ${
                  isUser
                    ? 'bg-slate-800 text-white'
                    : 'bg-white border border-slate-200 text-slate-800 shadow-sm'
                }`}
              >
                {isThinking ? (
                  <ThinkingIndicator />
                ) : (
                  <>
                    <pre className="whitespace-pre-wrap font-sans leading-relaxed">{msg.content}</pre>
                    {msg.content && (
                      <p className={`text-[11px] mt-1.5 ${isUser ? 'text-slate-400' : 'text-slate-300'}`}>
                        {msg.timestamp}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 bg-white px-6 py-4 shrink-0">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            placeholder={`Message ${displayName}... (Enter to send)`}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent bg-slate-50 placeholder:text-slate-400"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            {sending ? <span className="spinner-sm" /> : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

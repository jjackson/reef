'use client'

import { useState, useRef, useEffect } from 'react'
import { useDashboard } from './context/DashboardContext'

interface Message {
  role: 'user' | 'agent'
  content: string
  timestamp: string
}

export function ChatPanel() {
  const { instances, activeInstanceId, activeAgentId, setViewMode } = useDashboard()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const instance = instances.find(i => i.id === activeInstanceId)
  const agent = instance?.agents.find(a => a.id === activeAgentId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || sending || !activeInstanceId || !activeAgentId) return

    const userMsg: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)

    // Add a placeholder agent message that we'll stream into
    const agentMsg: Message = {
      role: 'agent',
      content: '',
      timestamp: new Date().toLocaleTimeString(),
    }
    setMessages(prev => [...prev, agentMsg])

    try {
      const res = await fetch(`/api/instances/${activeInstanceId}/agents/${activeAgentId}/chat`, {
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
  }

  const displayName = agent?.identityName || activeAgentId || 'agent'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {agent?.identityEmoji && <span>{agent.identityEmoji}</span>}
          <span className="font-medium text-gray-900">{displayName}</span>
          <span className="text-gray-400 font-mono">@ {instance?.label}</span>
        </div>
        <button
          onClick={() => setViewMode('detail')}
          className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
        >
          Back
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center pt-8">
            Chat with {displayName}
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-lg rounded-lg px-4 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-900'
              }`}
            >
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
              {msg.content && (
                <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                  {msg.timestamp}
                </p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 px-6 py-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            placeholder={`Message ${displayName}... (Enter to send)`}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

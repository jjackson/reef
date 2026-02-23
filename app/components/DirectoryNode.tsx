'use client'

import { useState } from 'react'
import { useDashboard } from './context/DashboardContext'

interface FileEntry {
  name: string
  type: 'file' | 'directory'
}

interface Props {
  instanceId: string
  path: string
  name: string
  type: 'file' | 'directory'
  depth?: number
  onFileClick?: (path: string, name: string) => void
}

export function DirectoryNode({ instanceId, path, name, type, depth = 0, onFileClick }: Props) {
  const { getDirCache, setDirCache } = useDashboard()
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(() => {
    // Initialize from cache if available
    if (type === 'directory') {
      const cached = getDirCache(instanceId, path)
      return cached ?? null
    }
    return null
  })
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (type !== 'directory') return
    if (expanded) { setExpanded(false); return }
    if (!children) {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/instances/${instanceId}/browse?path=${encodeURIComponent(path)}`
        )
        const data = await res.json()
        const entries = Array.isArray(data) ? data : []
        setChildren(entries)
        setDirCache(instanceId, path, entries)
      } finally {
        setLoading(false)
      }
    }
    setExpanded(true)
  }

  const indent = depth * 16

  const isFile = type !== 'directory'

  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 py-1 px-2 rounded-md text-[13px] transition-colors ${
          isFile
            ? 'cursor-default hover:bg-slate-50 text-slate-600'
            : 'cursor-pointer hover:bg-slate-100 text-slate-800'
        }`}
        style={{ paddingLeft: `${8 + indent}px` }}
        onClick={() => {
          if (type === 'directory') toggle()
          else if (onFileClick) onFileClick(path, name)
        }}
      >
        <span className="text-slate-400 w-4 text-center text-xs flex items-center justify-center shrink-0">
          {type === 'directory' ? (loading ? <span className="spinner" /> : expanded ? '\u25BE' : '\u25B8') : (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-slate-300">
              <path d="M3 1h7l4 4v10H3V1z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M10 1v4h4" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          )}
        </span>
        <span className={`truncate ${
          type === 'directory'
            ? 'font-medium text-slate-700'
            : 'text-slate-600 group-hover:text-slate-900'
        }`}>
          {name}{type === 'directory' ? '/' : ''}
        </span>
      </div>
      {expanded && children && (
        <div>
          {children.length === 0 && (
            <div className="text-xs text-slate-400 italic" style={{ paddingLeft: `${24 + indent}px` }}>
              empty
            </div>
          )}
          {children.map((child) => (
            <DirectoryNode
              key={child.name}
              instanceId={instanceId}
              path={`${path}/${child.name}`}
              name={child.name}
              type={child.type}
              depth={depth + 1}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

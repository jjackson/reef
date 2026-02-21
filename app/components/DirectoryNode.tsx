'use client'

import { useState } from 'react'

interface FileEntry {
  name: string
  type: 'file' | 'directory'
}

interface Props {
  instanceId: string
  path: string          // full remote path of this node
  name: string
  type: 'file' | 'directory'
  depth?: number
  onFileClick?: (path: string) => void
}

export function DirectoryNode({ instanceId, path, name, type, depth = 0, onFileClick }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(null)
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
        setChildren(data)
      } finally {
        setLoading(false)
      }
    }
    setExpanded(true)
  }

  function handleClick() {
    if (type === 'directory') {
      toggle()
    } else if (onFileClick) {
      onFileClick(path)
    }
  }

  const indent = depth * 16

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-0.5 px-2 rounded text-sm hover:bg-gray-100 ${
          type === 'directory'
            ? 'cursor-pointer'
            : onFileClick
            ? 'cursor-pointer hover:text-blue-700'
            : 'cursor-default text-gray-600'
        }`}
        style={{ paddingLeft: `${8 + indent}px` }}
        onClick={handleClick}
      >
        <span className="text-gray-400 w-3 text-center text-xs">
          {type === 'directory' ? (loading ? '...' : expanded ? '\u25BE' : '\u25B8') : '\u00B7'}
        </span>
        <span className={
          type === 'directory'
            ? 'text-blue-700 font-medium'
            : onFileClick
            ? 'text-gray-700 hover:text-blue-600'
            : 'text-gray-700'
        }>
          {name}
          {type === 'directory' ? '/' : ''}
        </span>
      </div>
      {expanded && children && (
        <div>
          {children.length === 0 && (
            <div className="text-xs text-gray-400 italic" style={{ paddingLeft: `${24 + indent}px` }}>
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

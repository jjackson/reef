import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

function loadNameMap(): Record<string, string> {
  const mapPath = join(process.cwd(), 'config', 'name-map.json')
  if (!existsSync(mapPath)) return {}
  try {
    return JSON.parse(readFileSync(mapPath, 'utf-8'))
  } catch {
    return {}
  }
}

/**
 * Maps a Digital Ocean droplet name to a 1Password item name prefix.
 *
 * Priority:
 *   1. Explicit mapping in config/name-map.json
 *   2. Auto-derive by stripping "open-claw-"/"openclaw-" prefix or suffix
 *   3. Fall back to the full droplet name
 */
export function getBotName(dropletName: string): string | null {
  if (dropletName.startsWith('__')) return null

  // Check explicit map first
  const map = loadNameMap()
  if (map[dropletName]) return map[dropletName]

  // Auto-derive from naming convention (prefix or suffix)
  const stripped = dropletName
    .replace(/^open-claw-/i, '')
    .replace(/^openclaw-/i, '')
    .replace(/-open-claw$/i, '')
    .replace(/-openclaw$/i, '')

  // If stripping changed nothing, the name doesn't follow convention
  if (stripped === dropletName) return dropletName

  return stripped
}

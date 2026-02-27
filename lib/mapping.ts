import { getGlobalNameMap } from './settings'

/**
 * Maps a Digital Ocean droplet name to a 1Password item name prefix.
 *
 * Priority:
 *   1. Explicit mapping in config/settings.json (across all accounts)
 *   2. Auto-derive by stripping "open-claw-"/"openclaw-" prefix or suffix
 *   3. Fall back to the full droplet name
 */
export function getBotName(dropletName: string): string | null {
  if (dropletName.startsWith('__')) return null

  // Check explicit map first
  const map = getGlobalNameMap()
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

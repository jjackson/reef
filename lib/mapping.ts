import nameMap from '@/config/name-map.json'

/**
 * Maps a Digital Ocean droplet name to a 1Password bot name.
 *
 * TODO: Replace this static JSON map with a smarter approach:
 *   - Store the bot name as a DO droplet tag (e.g. tag "reef-bot:hal")
 *   - Enforce a strict naming convention (droplet "open-claw-hal" → bot "hal")
 *   - Or ask each OpenClaw instance to self-report via a "reef reporter" skill
 *
 * For now, edit config/name-map.json to add new machines.
 */
export function getBotName(dropletName: string): string | null {
  if (dropletName.startsWith('__')) return null
  const map = nameMap as Record<string, string>
  return map[dropletName] ?? null
}

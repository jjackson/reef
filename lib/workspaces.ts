import { loadSettings, writeSettings } from './settings'

export interface Workspace {
  id: string
  label: string
  instances: string[]
}

export function getWorkspaces(): Workspace[] {
  const settings = loadSettings()
  return Object.entries(settings.workspaces).map(([id, config]) => ({
    id, label: config.label, instances: config.instances,
  }))
}

export function getWorkspaceForInstance(instanceName: string): Workspace | null {
  return getWorkspaces().find(w => w.instances.includes(instanceName)) ?? null
}

export function ensureDefaultWorkspace(allInstanceNames: string[]): void {
  const settings = loadSettings()
  const assigned = new Set<string>()
  for (const ws of Object.values(settings.workspaces)) {
    for (const name of ws.instances) assigned.add(name)
  }
  const unassigned = allInstanceNames.filter(n => !assigned.has(n))
  if (!settings.workspaces.default) {
    settings.workspaces.default = { label: 'Default', instances: [] }
  }
  for (const name of unassigned) {
    if (!settings.workspaces.default.instances.includes(name)) {
      settings.workspaces.default.instances.push(name)
    }
  }
  writeSettings(settings)
}

export function moveInstance(instanceName: string, workspaceId: string): void {
  const settings = loadSettings()
  for (const ws of Object.values(settings.workspaces)) {
    ws.instances = ws.instances.filter(n => n !== instanceName)
  }
  if (!settings.workspaces[workspaceId]) throw new Error(`Workspace "${workspaceId}" not found`)
  settings.workspaces[workspaceId].instances.push(instanceName)
  writeSettings(settings)
}

export function createWorkspace(id: string, label: string): void {
  const settings = loadSettings()
  if (settings.workspaces[id]) throw new Error(`Workspace "${id}" already exists`)
  settings.workspaces[id] = { label, instances: [] }
  writeSettings(settings)
}

export function deleteWorkspace(id: string): void {
  if (id === 'default') throw new Error('Cannot delete the default workspace')
  const settings = loadSettings()
  const ws = settings.workspaces[id]
  if (!ws) throw new Error(`Workspace "${id}" not found`)
  if (!settings.workspaces.default) settings.workspaces.default = { label: 'Default', instances: [] }
  settings.workspaces.default.instances.push(...ws.instances)
  delete settings.workspaces[id]
  writeSettings(settings)
}

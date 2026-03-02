import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockLoadSettings, mockWriteSettings } = vi.hoisted(() => ({
  mockLoadSettings: vi.fn(),
  mockWriteSettings: vi.fn(),
}))

vi.mock('../settings', () => ({
  loadSettings: mockLoadSettings,
  writeSettings: mockWriteSettings,
}))

import { getWorkspaces, getWorkspaceForInstance, ensureDefaultWorkspace, moveInstance, createWorkspace, deleteWorkspace } from '../workspaces'

describe('workspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getWorkspaces returns workspaces from settings', () => {
    mockLoadSettings.mockReturnValue({
      accounts: {},
      workspaces: { prod: { label: 'Production', instances: ['openclaw-hal'] } },
    })
    const result = getWorkspaces()
    expect(result).toEqual([{ id: 'prod', label: 'Production', instances: ['openclaw-hal'] }])
  })

  it('getWorkspaceForInstance finds the workspace containing an instance', () => {
    mockLoadSettings.mockReturnValue({
      accounts: {},
      workspaces: {
        prod: { label: 'Production', instances: ['openclaw-hal'] },
        dev: { label: 'Dev', instances: ['openclaw-eva'] },
      },
    })
    expect(getWorkspaceForInstance('openclaw-hal')?.id).toBe('prod')
    expect(getWorkspaceForInstance('openclaw-eva')?.id).toBe('dev')
    expect(getWorkspaceForInstance('nonexistent')).toBeNull()
  })

  it('ensureDefaultWorkspace creates default when none exist', () => {
    const settings = { accounts: {}, workspaces: {} as any }
    mockLoadSettings.mockReturnValue(settings)
    ensureDefaultWorkspace(['openclaw-hal', 'openclaw-eva'])
    expect(mockWriteSettings).toHaveBeenCalledWith(expect.objectContaining({
      workspaces: { default: { label: 'Default', instances: ['openclaw-hal', 'openclaw-eva'] } },
    }))
  })

  it('ensureDefaultWorkspace adds only unassigned instances to default', () => {
    const settings = {
      accounts: {},
      workspaces: {
        prod: { label: 'Production', instances: ['openclaw-hal'] },
      } as any,
    }
    mockLoadSettings.mockReturnValue(settings)
    ensureDefaultWorkspace(['openclaw-hal', 'openclaw-eva'])
    expect(settings.workspaces.default.instances).toEqual(['openclaw-eva'])
    expect(settings.workspaces.prod.instances).toEqual(['openclaw-hal'])
  })

  it('moveInstance transfers between workspaces', () => {
    const settings = {
      accounts: {},
      workspaces: {
        prod: { label: 'Production', instances: ['openclaw-hal'] },
        dev: { label: 'Dev', instances: [] },
      },
    }
    mockLoadSettings.mockReturnValue(settings)
    moveInstance('openclaw-hal', 'dev')
    expect(settings.workspaces.prod.instances).toEqual([])
    expect(settings.workspaces.dev.instances).toEqual(['openclaw-hal'])
  })

  it('createWorkspace adds new workspace', () => {
    const settings = { accounts: {}, workspaces: {} as any }
    mockLoadSettings.mockReturnValue(settings)
    createWorkspace('staging', 'Staging')
    expect(settings.workspaces.staging).toEqual({ label: 'Staging', instances: [] })
  })

  it('createWorkspace throws if workspace already exists', () => {
    mockLoadSettings.mockReturnValue({
      accounts: {},
      workspaces: { prod: { label: 'Production', instances: [] } },
    })
    expect(() => createWorkspace('prod', 'Production')).toThrow('already exists')
  })

  it('deleteWorkspace moves instances to default', () => {
    const settings = {
      accounts: {},
      workspaces: {
        default: { label: 'Default', instances: [] },
        dev: { label: 'Dev', instances: ['openclaw-eva'] },
      },
    }
    mockLoadSettings.mockReturnValue(settings)
    deleteWorkspace('dev')
    expect(settings.workspaces.default.instances).toEqual(['openclaw-eva'])
    expect(settings.workspaces.dev).toBeUndefined()
  })

  it('deleteWorkspace throws for default workspace', () => {
    expect(() => deleteWorkspace('default')).toThrow('Cannot delete')
  })
})

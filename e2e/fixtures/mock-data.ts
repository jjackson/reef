// --- Accounts ---
export const MOCK_ACCOUNTS = {
  accounts: [
    { id: 'personal', label: 'Personal' },
  ],
}

// --- Instances ---
export const MOCK_INSTANCES = [
  {
    id: 'openclaw-hal',
    label: 'openclaw-hal',
    ip: '167.71.100.1',
    providerId: '12345',
    provider: 'digitalocean',
    platform: 'openclaw',
    accountId: 'personal',
  },
  {
    id: 'openclaw-ada',
    label: 'openclaw-ada',
    ip: '167.71.100.2',
    providerId: '12346',
    provider: 'digitalocean',
    platform: 'openclaw',
    accountId: 'personal',
  },
]

// --- Agents ---
export const MOCK_AGENTS_HAL = [
  {
    id: 'main',
    identityName: 'Hal',
    identityEmoji: '\u{1F916}',
    workspace: '/root/.openclaw/workspace',
    agentDir: '/root/.openclaw/agents/main/agent',
    model: 'anthropic/claude-opus-4-6',
    isDefault: true,
  },
  {
    id: 'helper',
    identityName: 'Helper',
    identityEmoji: '\u{1F9BE}',
    workspace: '/root/.openclaw/workspace',
    agentDir: '/root/.openclaw/agents/helper/agent',
    model: 'anthropic/claude-sonnet-4-20250514',
    isDefault: false,
  },
]

export const MOCK_AGENTS_ADA = [
  {
    id: 'main',
    identityName: 'Ada',
    identityEmoji: '\u{1F4DA}',
    workspace: '/root/.openclaw/workspace',
    agentDir: '/root/.openclaw/agents/main/agent',
    model: 'anthropic/claude-opus-4-6',
    isDefault: true,
  },
]

// --- Workspaces ---
export const MOCK_WORKSPACES = {
  success: true,
  workspaces: [
    { id: 'default', label: 'All Instances', instances: ['openclaw-hal', 'openclaw-ada'] },
  ],
}

export const MOCK_MULTI_WORKSPACES = {
  success: true,
  workspaces: [
    { id: 'prod', label: 'Production', instances: ['openclaw-hal'] },
    { id: 'dev', label: 'Development', instances: ['openclaw-ada'] },
  ],
}

// --- Health ---
export const MOCK_HEALTH = {
  success: true,
  processRunning: true,
  output: '=== Gateway ===\nRuntime: running\n=== Version ===\n2026.2.22-2',
  version: '2026.2.22-2',
}

// --- Agent Health ---
export const MOCK_AGENT_HEALTH = {
  exists: true,
  dirSize: '42M',
  lastActivity: '2026-03-01T12:00:00Z',
  processRunning: true,
}

// --- Directory Browse ---
export const MOCK_DIRECTORY = [
  { name: 'memories', type: 'directory' },
  { name: 'skills', type: 'directory' },
  { name: 'config.json', type: 'file' },
  { name: 'README.md', type: 'file' },
]

// --- File Content ---
export const MOCK_FILE_CONTENT = {
  content: '# Agent Readme\n\nThis is the agent workspace readme.',
}

// --- Fleet Overview ---
export const MOCK_FLEET_OVERVIEW = {
  agents: [
    {
      instance: 'openclaw-hal',
      agentId: 'main',
      agentName: 'Hal',
      agentEmoji: '\u{1F916}',
      channels: ['telegram:hal'],
      workspaceSize: '42M',
      hasApiKey: true,
      hasGmailBinding: true,
      gmailWatchActive: true,
      hasTelegramBinding: true,
    },
  ],
  instances: [
    {
      instance: 'openclaw-hal',
      openclawVersion: '2026.2.22-2',
      gogAccounts: ['hal@example.com'],
      pubsubEndpoint: 'https://hal.tail12345.ts.net/webhook/gmail',
      tailscaleFunnel: 'hal.tail12345.ts.net',
      gcpProject: 'my-gcp-project',
      activeGmailWatches: ['hal@example.com'],
    },
  ],
}

// --- Create Machine supporting data ---
export const MOCK_REGIONS = {
  regions: [
    { slug: 'nyc1', name: 'New York 1' },
    { slug: 'sfo3', name: 'San Francisco 3' },
  ],
}

export const MOCK_SIZES = {
  sizes: [
    { slug: 's-1vcpu-1gb', memory: 1024, vcpus: 1, disk: 25, priceMonthly: 6 },
    { slug: 's-2vcpu-2gb', memory: 2048, vcpus: 2, disk: 50, priceMonthly: 12 },
  ],
}

export const MOCK_SSH_KEYS = {
  keys: [
    { id: '1', title: 'Hal SSH Key' },
    { id: '2', title: 'Ada SSH Key' },
  ],
}

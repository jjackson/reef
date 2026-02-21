# Broadcast Prompt Design

## Problem

No way to send a single prompt to multiple agents at once. Currently you either chat with one agent or run bulk health/hygiene/backup via FleetPanel.

## Solution

Add a "Broadcast" button to FleetPanel that opens a prompt input, sends it to all checked agents in parallel, and creates a tabbed chat interface with one tab per agent. Each tab becomes an independent conversation after the initial broadcast.

## Entry Point

- New "Broadcast" button in FleetPanel toolbar (next to Health All / Hygiene All / Backup All)
- Clicking opens an inline prompt input with a send button
- On send: switches view to `broadcast` mode

## Components

### ChatWindow (extracted, shared)

Extract the core chat UI from the existing `ChatPanel` into a reusable component.

**Props:**
- `instanceId: string`
- `agentId: string`
- `agentName: string`
- `agentEmoji: string`
- `instanceLabel: string`
- `initialMessage?: string` — if provided, auto-sends on mount

**Owns:**
- `messages: Message[]` local state
- SSE streaming logic (POST to `/api/instances/{id}/agents/{agentId}/chat`)
- Input bar (Enter to send, Shift+Enter for newline)
- Thinking indicator, message rendering, timestamps

### ChatPanel (refactored)

Becomes a thin wrapper around `ChatWindow`. Reads `activeInstanceId`/`activeAgentId` from context, renders `<ChatWindow>` with those props. Adds a header with back button and agent info.

### BroadcastPanel (new)

New view mode component rendered when `viewMode === 'broadcast'`.

**State:**
- `tabs: Array<{instanceId, agentId, agentName, agentEmoji, instanceLabel}>` — set from checked agents at broadcast time
- `activeTabKey: string` — `"instanceId:agentId"` of focused tab
- `broadcastMessage: string` — the initial prompt (passed as `initialMessage` to each ChatWindow)

**UI:**
- Header: "Broadcast Chat" + agent count + back button
- Tab strip: horizontal row of tabs, each showing emoji + agent name
  - Active tab highlighted
  - Designed as a data-driven list (easy to later render vertically)
- Body: renders `<ChatWindow>` for the active tab
- All ChatWindows mount at broadcast time and stream in parallel (rendered but hidden when not active, or keyed to preserve state)

### Sidebar Enhancement

- Add collapse toggle (chevron) to the machine/agent tree section
- Collapsed state hides the tree, shows only the toggle
- Frees horizontal space for future left-rail tab placement

## View Mode

Add `'broadcast'` to the existing `viewMode` union: `'detail' | 'chat' | 'file' | 'fleet' | 'broadcast'`

## Data Flow

```
User checks 2+ agents → FleetPanel shows
  → User clicks "Broadcast" → Prompt input appears
  → User types message, hits send
  → viewMode switches to 'broadcast'
  → BroadcastPanel mounts with checked agents as tabs
  → Each ChatWindow receives initialMessage, auto-sends on mount
  → N parallel SSE streams fire to existing chat API
  → User switches tabs to see each conversation
  → Typing in active tab sends only to that agent
```

## Key Decisions

- **No new API routes** — reuses existing `/api/instances/{id}/agents/{agentId}/chat`
- **No broadcast state in context** — each ChatWindow owns its messages locally
- **ChatWindows stay mounted** when switching tabs (hidden via CSS) so streams aren't interrupted
- **Initial message auto-fires** — ChatWindow detects `initialMessage` prop and sends it on mount without user interaction

## Sidebar Collapsibility

- Toggle on the "Instances" section header
- Boolean state (local to Sidebar or in context)
- Collapsed: hides tree, shows only header with expand chevron
- Prepares for future: tab strip could live in the left panel

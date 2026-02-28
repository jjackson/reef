# Tmux Persistent Terminals Design

## Problem

Terminal sessions in Reef are ephemeral. When you click away from an instance (to view another instance or agent), the WebSocket closes, the SSH connection drops, and the terminal output is lost. Commands that take time (install scripts, doctor, logs) can't be monitored after navigating away.

## Solution

Use tmux on the remote droplets to persist terminal sessions. Each command creates a named tmux session that survives SSH disconnects. When the user navigates back, Reef auto-discovers and reattaches to the session.

## Approach: tmux per-command sessions

Each terminal action (Health, Doctor, Install, etc.) creates its own tmux session on the droplet. Sessions are named `reef-<unix-timestamp-ms>` for uniqueness and sort order.

### Backend changes

**Terminal WebSocket route** (`app/api/instances/[id]/terminal/route.ts`):

- **Create session** (no `?session=` query param): SSH in, run `tmux new-session -d -s reef-<ts> -x <cols> -y <rows>`, optionally send the initial command, then attach via `tmux attach -t reef-<ts>`. Send `{ type: 'session', name: 'reef-<ts>' }` to the client so it can store the session name.
- **Reattach** (`?session=reef-<ts>`): SSH in, run shell with `tmux attach -t reef-<ts>`. Client sees buffered output from where the session left off.

**New endpoint** — `GET /api/instances/[id]/terminal/sessions`:

- SSH in, run `tmux list-sessions -F '#{session_name}' 2>/dev/null` filtered to `reef-*` prefix.
- Returns `{ sessions: [{ name: "reef-1740700000123" }] }`.

**New endpoint** — `POST /api/instances/[id]/terminal/kill-sessions`:

- SSH in, run `tmux list-sessions -F '#{session_name}' | grep '^reef-' | xargs -I{} tmux kill-session -t {}`.
- Only kills `reef-*` sessions, leaves user-created tmux sessions intact.
- Returns `{ success: true, killed: <count> }`.

### Frontend changes

**DashboardContext** (`app/components/context/DashboardContext.tsx`):

- Add `terminalSessions: Map<string, string>` — maps `instanceId` to active tmux session name.
- Add `setTerminalSession(instanceId, sessionName)` and `clearTerminalSession(instanceId)` helpers.

**InstanceDetail** (`app/components/InstanceDetail.tsx`):

- On mount, check `terminalSessions` map for the current instance. If a session name exists, auto-open the terminal panel with that session name (reattach mode).
- Also call `GET /api/instances/[id]/terminal/sessions` to discover sessions that survived a Reef server restart. If sessions exist but none are in React state, attach to the most recent one.
- Action buttons (Health, Doctor, etc.) continue to call `openTerminal(command)`. If a terminal is already showing, the new command creates a new tmux session and switches to it (old session keeps running).
- Add "Kill Sessions" button to the instance action toolbar. Calls `POST /api/instances/[id]/terminal/kill-sessions`, then clears the terminal panel and React state.

**Terminal component** (`app/components/Terminal.tsx`):

- Accept optional `sessionName` prop. If provided, append `?session=<name>` to the WebSocket URL (reattach). If not, create a new session.
- Listen for `{ type: 'session', name }` message from the server and call `onSessionCreated(name)` callback to update parent state.
- On close button click: send `tmux kill-session -t <name>` via the session before closing, so the remote session is cleaned up.

### Session lifecycle

- **Create**: Action button clicked → new tmux session on remote → name stored in React state.
- **Detach**: User navigates away → WebSocket closes → SSH disconnects → tmux session keeps running.
- **Reattach**: User navigates back → InstanceDetail auto-discovers session → opens terminal with `?session=` → reattaches.
- **Kill single**: User clicks "x" on terminal → kills that tmux session remotely → clears from state.
- **Kill all**: User clicks "Kill Sessions" in toolbar → kills all `reef-*` sessions on that instance.
- **Natural death**: If the command finishes and the user exits the shell, tmux kills the session automatically.

### Session naming

Format: `reef-<Date.now()>` (e.g. `reef-1740700000123`). Simple, unique, sortable by creation time.

### What this does NOT include

- Multiple terminal tabs/windows in the UI (one terminal panel at a time, like today)
- Automatic session expiry/cleanup timers
- Cross-browser session sharing

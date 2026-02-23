# Terminal Integration & Agent Creation Redesign

## Problem

Creating agents via `openclaw agents add --non-interactive` is unreliable. During the Ada agent creation on openclaw-hal, we hit five distinct failures:

1. **Missing auth profile** — `--non-interactive` doesn't create `auth-profiles.json` in the agent dir. Without it, the agent can't call the LLM API and bootstrap stays PENDING forever.
2. **Case-sensitive path mismatch** — The CLI created workspace at `/agents/Ada/workspace` (preserving input casing) but agent dir at `/agents/ada/agent` (lowercase), causing session path validation errors.
3. **Session path validation bug** — `Session file path must be within sessions directory` error even after fixing paths. Required an OpenClaw version update to resolve.
4. **No identity setup** — `set-identity` command syntax differs from expected; identity is normally configured during the interactive wizard.
5. **Bootstrap never triggers** — The agent stays PENDING until a message arrives AND all the above issues are resolved. No feedback loop to tell you what's broken.

The interactive wizard (`openclaw agents add` without `--non-interactive`) handles all of this automatically. Rather than reverse-engineering the wizard steps, we should let users run the wizard directly.

## Solution

Embed an SSH terminal (xterm.js + WebSocket) in the Reef UI. This serves three purposes:

1. **Create Agent** — runs the interactive wizard, which handles directory structure, auth, identity, and bootstrap correctly
2. **Upgrade OpenClaw** — runs `npm update -g openclaw && openclaw gateway restart` with live output
3. **General terminal access** — ad-hoc debugging, log inspection, doctor runs, etc.

## Architecture

### Backend: WebSocket PTY Relay

**Route:** `app/api/instances/[id]/terminal/route.ts`

Upgrades HTTP to WebSocket. On connection:
1. Resolves instance via `resolveInstance(id)` (same auth as other API routes)
2. Opens SSH connection to instance using existing `ssh2` infrastructure
3. Requests a PTY shell channel (`ssh.shell()`)
4. Relays bidirectionally: browser keystrokes to SSH stdin, SSH stdout to browser

**Wire protocol (JSON):**
- Client to server: `{ type: "data", data: "..." }` for keystrokes, `{ type: "resize", cols: N, rows: N }` for terminal resize
- Server to client: `{ type: "data", data: "..." }` for terminal output

On WebSocket disconnect: closes SSH channel and connection.

### Frontend: Terminal Component

**New component:** `app/components/Terminal.tsx`

- Uses `xterm.js` + `xterm-addon-fit`
- Props: `instanceId`, `initialCommand?`, `onClose`
- Connects to WebSocket at `/api/instances/{id}/terminal`
- ResizeObserver sends resize events to keep PTY dimensions in sync
- Dark theme, monospace font

**Layout:** Terminal appears as a panel at the bottom of the instance detail view (like VS Code's integrated terminal), not a modal. User can see instance info above while interacting with the terminal below.

### Action Bar Changes

**Instance action bar (updated):**

```
[Health] [Doctor] | [Create Agent] [Add Channel] [Upgrade] | [>_ Terminal]
```

| Button | Behavior |
|--------|----------|
| Create Agent | Opens terminal panel with `openclaw agents add` pre-filled |
| Add Channel | Keeps existing modal (works fine for non-interactive `channels add`) |
| Upgrade | Opens terminal with `npm update -g openclaw && openclaw gateway restart` |
| Terminal | Opens blank terminal for ad-hoc commands |

### What Changes

- **Removed:** `CreateAgentDialog` modal component in `InstanceDetail.tsx`
- **Kept (CLI only):** `createAgent()` in `lib/openclaw.ts` — still useful for the `reef` CLI tool
- **Kept:** `AddChannelDialog` — non-interactive channel add works reliably
- **New deps:** `xterm`, `xterm-addon-fit`

## Dependencies

- `xterm` — terminal emulator for the browser
- `xterm-addon-fit` — auto-resize terminal to container
- `ssh2` — already installed, supports PTY shell channels

## Verification

1. Open terminal on an instance — see a working bash prompt
2. Type `openclaw agents add` — wizard runs interactively, creates a fully working agent
3. Click "Create Agent" — terminal opens with wizard pre-filled
4. Click "Upgrade" — see npm update output, gateway restarts
5. Resize browser — terminal resizes correctly
6. Close terminal panel — SSH connection cleaned up
7. Existing Health/Doctor/Add Channel buttons still work as before

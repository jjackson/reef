# Reef CLI — Agent Operations Guide

> This guide is for AI agents (Claude, etc.) that manage OpenClaw instances via the `reef` CLI. Every command outputs JSON to stdout. Parse `success` to determine if the command worked.

## Setup

```bash
# From the reef project directory:
npx reef <command>

# Or if globally linked (npm link):
reef <command>
```

## Quick Reference

| Command | Purpose |
|---------|---------|
| `reef instances` | List all instances |
| `reef health <inst>` | Check instance health |
| `reef agents <inst>` | List agents |
| `reef status <inst>` | Deep diagnostics |
| `reef doctor <inst>` | Auto-fix issues |
| `reef restart <inst>` | Restart OpenClaw |
| `reef channels <inst>` | List channels |
| `reef logs <inst> [--lines N]` | View logs |
| `reef agent-health <inst> <agent>` | Agent status |
| `reef chat <inst> <agent> <msg>` | Send message |
| `reef create-agent <inst> <name>` | Create agent |
| `reef delete-agent <inst> <agent>` | Delete agent |
| `reef add-channel <inst> <type> <token>` | Add channel |
| `reef bind-channel <inst> <agent> <ch>` | Bind channel |
| `reef approve-pairing <inst> <ch> <code>` | Approve user |
| `reef pairing-requests <inst> <ch>` | List pairings |
| `reef ssh <inst> <command>` | Run SSH command |
| `reef ls <inst> <path>` | List directory |
| `reef cat <inst> <path>` | Read file |
| `reef backup <inst> <agent>` | Backup agent |
| `reef deploy <inst> <agent> <tar>` | Deploy agent |

## Instance IDs

Instance IDs are Digital Ocean droplet names containing `openclaw` or `open-claw`. Example: `openclaw-hal`.

To discover instances:
```bash
reef instances
# → { "success": true, "instances": [{ "id": "openclaw-hal", "label": "openclaw-hal", "ip": "..." }] }
```

## Troubleshooting Workflows

### Agent Not Responding

When a user reports that an agent isn't responding on Telegram/Discord:

```bash
# Step 1: Check instance health
reef health openclaw-hal
# Look at: processRunning (should be true), disk (not full), memory (not exhausted)

# Step 2: Check agent exists and is active
reef agents openclaw-hal
# Look for the agent in the list. Check isDefault, model fields.

# Step 3: Check agent directory health
reef agent-health openclaw-hal main
# Look at: exists (true), processRunning, lastActivity (recent?)

# Step 4: Check channels are configured
reef channels openclaw-hal
# Verify the channel type (telegram, discord) exists

# Step 5: Check logs for errors
reef logs openclaw-hal --lines 100 --agent main
# Look for error messages, stack traces, connection failures

# Step 6: Run doctor to auto-fix
reef doctor openclaw-hal

# Step 7: If still broken, restart
reef restart openclaw-hal
# Returns { success, method: "gateway"|"systemd"|"process-kill" }

# Step 8: Verify recovery
reef health openclaw-hal
```

### Instance Down / Process Not Running

```bash
# Check health first
reef health openclaw-hal
# If processRunning is false:

# Try restart
reef restart openclaw-hal

# If restart fails, check system state
reef ssh openclaw-hal "systemctl --user status openclaw-gateway"
reef ssh openclaw-hal "journalctl --user -u openclaw-gateway --no-pager -n 50"

# Check disk space (might be full)
reef ssh openclaw-hal "df -h /"

# Check if port is held by zombie process
reef ssh openclaw-hal "lsof -i :18789"
```

### Creating a New Agent

```bash
# Create the agent
reef create-agent openclaw-hal myagent --model anthropic/claude-sonnet-4-20250514

# Verify it was created
reef agents openclaw-hal

# Add a channel if needed
reef add-channel openclaw-hal telegram BOT_TOKEN_HERE

# Bind the channel to the agent
reef bind-channel openclaw-hal myagent telegram

# Restart to pick up changes
reef restart openclaw-hal
```

**Known issue:** `create-agent` uses `--non-interactive` mode which doesn't run the full setup wizard. For reliable agent creation including identity setup and bootstrap, use an SSH terminal to run the interactive `openclaw agents add` wizard.

### Approving a Telegram User

When a user sends a pairing code to the bot:

```bash
# Check pending requests
reef pairing-requests openclaw-hal telegram

# Approve the code
reef approve-pairing openclaw-hal telegram ABC123
```

### Checking Logs

```bash
# Recent logs (default 50 lines)
reef logs openclaw-hal

# More lines
reef logs openclaw-hal --lines 200

# Filter by agent
reef logs openclaw-hal --agent main

# For deeper investigation, use ssh
reef ssh openclaw-hal "journalctl --user -u openclaw-gateway --since '1 hour ago' --no-pager"
```

### Reading Configuration Files

```bash
# List agent directories
reef ls openclaw-hal ~/.openclaw/agents/

# Read openclaw config
reef cat openclaw-hal ~/.openclaw/openclaw.json

# Read agent-specific config
reef cat openclaw-hal ~/.openclaw/agents/main/agent/config.json

# Check auth profiles exist
reef ls openclaw-hal ~/.openclaw/agents/main/agent/
```

### Backup and Migration

```bash
# Backup an agent
reef backup openclaw-hal main
# → { "success": true, "path": "./backups/openclaw-hal-main-2026-02-23T..." }

# Verify the backup
reef check-backup ./backups/openclaw-hal-main-2026-02-23T...tar.gz

# Deploy to another instance
reef deploy openclaw-dot main ./backups/openclaw-hal-main-2026-02-23T...tar.gz
```

## Output Contract

Every command returns JSON with at minimum:
```json
{ "success": true|false }
```

On failure, an `error` field is included:
```json
{ "success": false, "error": "Instance not found: bad-name" }
```

Common fields by command:

| Command | Key Fields |
|---------|-----------|
| `health` | `processRunning`, `disk`, `memory`, `uptime`, `output` |
| `agents` | `agents[]` with `id`, `identityName`, `model`, `isDefault` |
| `status` | `output`, `exitCode` |
| `doctor` | `output`, `exitCode` |
| `restart` | `success`, `method`, `output` |
| `channels` | `chat` (map of channel type to account list) |
| `agent-health` | `exists`, `dirSize`, `lastActivity`, `processRunning` |
| `chat` | `reply`, `agentId`, `model`, `sessionId` |
| `logs` | `output`, `lines` |
| `ssh` | `stdout`, `stderr`, `exitCode` |
| `ls` | `entries[]` with `name`, `type` |
| `cat` | `content` |

## Decision Trees

### "Something is wrong with the agent"

```
Is the instance healthy? (reef health)
├── processRunning: false → reef restart, then re-check
├── disk full → reef ssh "apt clean && journalctl --vacuum-size=100M"
├── memory exhausted → reef restart (clears memory)
└── processRunning: true
    ├── Does the agent exist? (reef agents)
    │   └── not in list → reef create-agent or check spelling
    ├── Is the agent healthy? (reef agent-health)
    │   ├── exists: false → agent dir missing, redeploy from backup
    │   └── processRunning: false → reef restart
    ├── Are channels configured? (reef channels)
    │   └── missing → reef add-channel + reef bind-channel
    ├── Check logs for errors (reef logs --agent <id>)
    │   ├── auth errors → check auth-profiles.json exists
    │   ├── rate limits → wait or switch model
    │   └── connection errors → restart
    └── Try sending a test message (reef chat)
        ├── gets response → channel/webhook issue, not agent
        └── no response → reef doctor, then reef restart
```

### "Need to set up a new instance"

```
1. reef instances          → find the instance
2. reef health <inst>      → verify it's running
3. reef agents <inst>      → see what's already there
4. reef channels <inst>    → see what channels exist
5. Create agents as needed → reef create-agent
6. Add channels as needed  → reef add-channel
7. Bind channels to agents → reef bind-channel
8. reef restart <inst>     → apply changes
9. reef health <inst>      → verify still healthy
```

## Important Notes

- Instance IDs are the full droplet name (e.g. `openclaw-hal`), not shortened
- Agent IDs are case-sensitive and typically lowercase
- The `ssh` command is an escape hatch — use it when specific commands aren't available
- `restart` tries three methods in order: gateway → systemd → process kill
- `doctor` runs in non-interactive mode — it will auto-fix what it can
- Channel tokens (bot tokens) should be passed as-is, the CLI handles escaping
- After creating agents or adding channels, always `restart` to apply changes

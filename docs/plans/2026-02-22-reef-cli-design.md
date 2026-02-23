# Reef CLI Design

## Goal

Expose reef's instance management operations as a CLI tool (`reef`) so AI agents (Claude Code locally, OpenClaw agents remotely) and humans can manage instances without the web UI.

## Command Structure

All commands output JSON to stdout. Errors go to stderr with exit code 1.

```
reef instances                                # List all instances
reef health <instance>                        # Instance health
reef agents <instance>                        # List agents on instance
reef status <instance>                        # Deep status (openclaw status --all --deep)
reef doctor <instance>                        # Run openclaw doctor --deep --yes
reef restart <instance>                       # Restart via openclaw gateway restart
reef backup <instance> <agent>                # Tar + SFTP pull agent to local
reef check-backup <tarball>                   # Verify tarball integrity + contents
reef deploy <instance> <agent> <tarball>      # Push tarball, untar, run doctor
reef chat <instance> <agent> <message>        # Send message to agent
reef agent-health <instance> <agent>          # Agent-specific health
reef agent-hygiene <instance> <agent>         # Agent-specific hygiene
```

## Architecture

- Single file: `bin/reef.ts` with `#!/usr/bin/env npx tsx` shebang
- Registered in `package.json` `"bin"` field, installed globally via `npm link`
- No CLI framework — manual `process.argv` parsing (12 commands, positional args)
- Each command: `loadEnv()` + `resolveInstance()` + lib function call + JSON output

## Output Contract

Every command outputs `{ success: boolean, ... }`. Errors: `{ success: false, error: "message" }`.

## OpenClaw Native Commands

Leverage OpenClaw CLI where superior to our current approach:

| reef command | OpenClaw command | Replaces |
|---|---|---|
| `health` | `openclaw health --json --verbose` | pgrep/df/free parsing |
| `status` | `openclaw status --all --deep` | new capability |
| `doctor` | `openclaw doctor --deep --yes` | new capability |
| `restart` | `openclaw gateway restart` | systemctl restart openclaw |

Existing `getHealth()` stays as fallback for installs without `openclaw health`.

## Migration Pipeline

Replaces monolithic `migrateAgent()` with composable steps:

1. `reef backup openclaw-dot myagent` — tars agent dir, SFTP pulls to `./backups/<instance>-<agent>-<timestamp>.tar.gz`
2. `reef check-backup ./backups/file.tar.gz` — verifies integrity, lists contents
3. `reef deploy openclaw-hal myagent ./backups/file.tar.gz` — pushes, untars, runs `openclaw doctor`

Each step is independently inspectable. An agent or human can verify between steps.

## Documentation

Add `## CLI Reference` section to CLAUDE.md with all commands, args, and example outputs. This is the primary agent-facing documentation — any Claude Code session automatically discovers it.

## Testing

Lib functions are already tested (20 tests across 4 files). CLI validated end-to-end by using it on a live stuck agent immediately after building.

## Files Changed

- `bin/reef.ts` — new, CLI entry point
- `package.json` — add `"bin"` field
- `lib/openclaw.ts` — add `getStatus()`, `runDoctor()`, update `restartOpenClaw()` to use gateway command
- `CLAUDE.md` — add CLI reference section

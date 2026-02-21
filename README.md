# reef

Management console for OpenClaw instances running on Digital Ocean.

## Setup

1. `npm install`

2. Copy `.env.local.example` to `.env.local` and fill in:
   - `DO_API_TOKEN` — Digital Ocean API token
   - `OP_SERVICE_ACCOUNT_TOKEN` — 1Password service account token (for SSH key resolution)

3. Copy `config/name-map.example.json` to `config/name-map.json` and add your droplet-to-1Password mappings. Example:
   ```json
   { "dot-openclaw": "Dot", "myri-openclaw": "Myri" }
   ```
   The key is the DO droplet name, the value is the 1Password item name prefix.
   Droplets with `openclaw` or `open-claw` in the name are auto-discovered.
   Droplets following the `open-claw-<name>` or `<name>-openclaw` naming convention auto-derive their 1Password name — only add explicit entries when the 1Password item name doesn't match.

4. In 1Password (`AI-Agents` vault), store SSH keys as Secure Notes named `<Name> - SSH Private Key` (the key content goes in the note body, resolved via `notesPlain` field).

5. `npm run dev` → http://localhost:3000

## Architecture

- **Next.js 15** App Router with TypeScript and Tailwind CSS
- **Digital Ocean API** — discovers droplets by name pattern (not tags)
- **1Password SDK** — resolves SSH keys and optionally the DO token
- **ssh2** — per-request SSH connections to each droplet
- **OpenClaw** — agents live at `~/.openclaw/agents/<agentId>/` on each droplet

## Tests

```
npm test        # watch mode
npm run test:run # single run
```

20 tests across 4 files: mapping (8), openclaw (8), digitalocean (2), instances (2).

## Known TODOs

- `lib/openclaw.ts` — confirm OpenClaw hygiene check CLI command name
- `lib/openclaw.ts` — confirm OpenClaw HTTP API port + agent routing for chat

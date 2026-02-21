# reef

Management console for OpenClaw instances running on Digital Ocean.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in values.

2. Tag your Digital Ocean droplets with `openclaw`.

3. Add droplet → bot name mappings to `config/name-map.json`.

4. In 1Password (`AI-Agents` vault), ensure each bot has an item named
   `<bot-name> - SSH Private Key` with a `private key` field.

5. `npm install && npm run dev` → http://localhost:3000

## Known TODOs

- `lib/mapping.ts` — replace JSON map with DO tags or naming convention
- `lib/openclaw.ts` — confirm OpenClaw hygiene check CLI command name
- `lib/openclaw.ts` — confirm OpenClaw HTTP API port + agent routing for chat

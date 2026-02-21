# Reef Feature Brainstorm

## Current State

Reef is a Next.js 15 dashboard that discovers OpenClaw agent instances on Digital Ocean droplets via name pattern matching. It offers machine-level actions (health, hygiene, backup) and per-agent file browsing plus placeholder chat. Key gaps: health actions are machine-scoped not agent-scoped, chat API is a placeholder, file browsing can't read contents, no persistent state, and `alert()` for result display.

---

## Feature 1: Agent-Level Health & Actions

**Problem:** Health check runs `systemctl is-active openclaw`, `df`, `free`, `uptime` — all machine-level. These don't tell you anything about an individual agent's state. The action buttons (health, hygiene, backup) live on `MachineRow` but logically belong on `AgentRow`.

**Proposal:**
- Move health/hygiene/backup buttons from `MachineRow` into `AgentRow`
- Agent health = ask the agent via chat API: "What's your status? Are you operational?" + check agent-specific files exist and are recent
- Agent hygiene = run hygiene per-agent (check logs for errors, disk usage of agent dir, stale files)
- Agent backup = tar just the agent's directory instead of the whole `~/.openclaw/`
- Machine row keeps a lightweight summary (disk, memory, uptime) but loses the action buttons
- Agent row gets the colored action buttons

**Key files to modify:**
- `app/components/MachineRow.tsx` — remove action buttons, keep summary strip
- `app/components/AgentRow.tsx` — add health/hygiene/backup buttons
- `lib/openclaw.ts` — add agent-scoped health/hygiene/backup functions
- `app/api/instances/[id]/agents/[agentId]/health/route.ts` — new route
- `app/api/instances/[id]/agents/[agentId]/backup/route.ts` — new route

---

## Feature 2: Agent Migration Between Machines

**Problem:** No way to move an agent from one droplet to another.

**Proposal — 3-phase migration with verification:**
1. **Pre-flight:** Chat with agent: "Summarize your current state, active tasks, and configuration." Save response as migration manifest.
2. **Transfer:** Tar agent directory on source, SFTP to Reef, SFTP to destination, untar. Optionally stop agent on source first.
3. **Post-flight:** Chat with agent on new machine: "Verify your state. Confirm you can access your memories and skills. Compare against this manifest: [pre-flight response]." Show side-by-side comparison in UI.
4. **Rollback:** Keep source files until user confirms migration succeeded. One-click rollback.

**UI:** Migration wizard — select agent, select destination machine, progress through phases, side-by-side verification panel.

**Key files to create:**
- `lib/migration.ts` — migration logic (tar, transfer, verify)
- `app/api/instances/[id]/agents/[agentId]/migrate/route.ts` — migration API
- `app/migrate/page.tsx` — migration wizard UI

**Dependencies:** Benefits from Feature 1 (agent-level actions) but can use chat directly.

---

## Feature 3: Skills & Memory Aggregation Browser

**Problem:** Each agent has skills and memories but there's no way to see them across agents or read file contents from the dashboard.

**Important:** The valuable data (skills, memories, config) lives in the `workspace` folder, not the `agents` folder. The exact structure and best extraction approach is still being explored in parallel sessions — this feature should be designed to adapt once that's settled.

**Proposal:**
- **File content viewer** (prerequisite): Add a read endpoint that returns file contents via SSH `cat`
- New page: `/browser` or `/knowledge`
- Scan all agents across all machines for known paths under `workspace/` (skills, memories, CLAUDE.md, config)
- Aggregate into a searchable, filterable view: "Show me all agents' memories" or "Which agents have skill X?"
- Card-per-agent showing: agent name, machine, skill count, memory summary, last modified dates
- Click into any agent to see full skill/memory content
- Diff view: compare skills/memories between two agents

**Key files to create:**
- `app/api/instances/[id]/browse/read/route.ts` — file content read endpoint
- `app/browser/page.tsx` — aggregation browser UI
- `lib/workspace.ts` — workspace scanning and content extraction logic

**Open question:** Exact workspace folder structure and how to best extract/parse skill and memory data. Update this once parallel exploration sessions conclude.

---

## Feature 4: Manager Agent — AI Daily Standup

**Problem:** No automated oversight of agent fleet. You have to manually check each one.

**Proposal:**
- **Daily standup flow:**
  1. Iterate all agents across all machines
  2. Chat with each: "What did you work on today? Any blockers? Recommendations for improving your prompts or configuration? Any hygiene concerns?"
  3. Aggregate responses into a structured report
  4. Surface recommendations (agent X suggests prompt change Y, agent Z reports disk pressure)

- **Two consumers of this feature:**
  1. **Reef UI** — `/standup` page with a "Run Standup" button for on-demand use, plus a report viewer
  2. **Programmatic API** — exposed as clean REST endpoints that an OpenClaw manager agent can call on a daily cron to run standups autonomously

- **Programmatic API design:**
  - `POST /api/standup/run` — triggers a standup across all agents, returns a standup ID
  - `GET /api/standup/[id]` — fetch a standup report by ID
  - `GET /api/standup/latest` — fetch the most recent report
  - `POST /api/standup/ask` — ad-hoc fleet-wide question: `{ question: string }` → aggregated responses

- **Report storage:** Local JSON files or SQLite — each standup saved with timestamp, per-agent responses, flagged items, recommendations

- **NOTE:** Review OpenClaw best practices before finalizing the programmatic interface. Determine whether a CLI wrapper, direct API consumption, or an MCP tool interface is the most natural way for an OpenClaw manager agent to interact with Reef. The goal is that the manager agent can run this daily without human intervention.

**Key files to create:**
- `lib/standup.ts` — standup orchestration logic
- `app/api/standup/run/route.ts` — trigger standup
- `app/api/standup/[id]/route.ts` — fetch report
- `app/api/standup/latest/route.ts` — latest report
- `app/api/standup/ask/route.ts` — ad-hoc fleet question
- `app/standup/page.tsx` — standup UI

---

## Feature 5: File Content Viewer & Editor

**Problem:** `DirectoryNode` shows the file tree but you can't read or edit files. This blocks Feature 3 and general usability.

**Proposal:**
- `GET /api/instances/[id]/browse/read?path=...` — returns file content via SSH `cat` (with size limits)
- `POST /api/instances/[id]/browse/write` — writes file content via SSH (with path restrictions to `~/.openclaw/`)
- UI: Click a file in `DirectoryNode` to open a side panel or modal with syntax-highlighted content
- Edit mode: Monaco editor or simple textarea with save button
- Safety: confirm before writes, show diff of changes

**Key files to create/modify:**
- `app/api/instances/[id]/browse/read/route.ts` — new read endpoint
- `app/api/instances/[id]/browse/write/route.ts` — new write endpoint
- `app/components/FileViewer.tsx` — file content display component
- `app/components/DirectoryNode.tsx` — add click-to-open behavior for files

---

## Feature 6: Dashboard UX Overhaul

**Problem:** `alert()` for results, no nav shell, title says "Create Next App", no auto-refresh, loading states are just `'...'`.

**Proposal:**
- Add a proper nav shell (sidebar or top nav) with links to Dashboard, Browser, Standup, etc.
- Replace `alert()` with inline result panels or toast notifications
- Add auto-refresh polling (every 30s) or manual refresh button
- Fix metadata (title → "Reef", description)
- Add proper loading skeletons instead of `'...'` button text
- Dark mode that actually works (CSS vars exist but Tailwind `dark:` classes aren't used)
- Responsive layout

**Key files to modify:**
- `app/layout.tsx` — add nav shell, fix metadata
- `app/components/MachineRow.tsx` — replace alerts, add skeletons
- `app/components/AgentRow.tsx` — loading improvements
- `app/globals.css` — dark mode, design tokens

---

## Feature 7: Action Log & Audit Trail

**Problem:** No history of what operations were performed. Results disappear on refresh.

**Proposal:**
- Local storage or SQLite for action history
- Log every operation: timestamp, instance, agent, action type, result summary, full output
- New page or panel: `/logs` showing chronological action history
- Filter by instance, agent, action type, date range

**Key files to create:**
- `lib/actionlog.ts` — logging logic and storage
- `app/api/logs/route.ts` — query log entries
- `app/logs/page.tsx` — log viewer UI
- Modify all existing API routes to emit log entries

---

## Feature 8: Bulk Operations

**Problem:** Can only run health/hygiene/backup one agent at a time.

**Proposal:**
- "Check All" button on dashboard — runs health across all agents in parallel
- "Backup All" button — backs up all agents across all machines
- Fleet-wide status summary at top of dashboard: X agents healthy, Y need attention, Z total disk
- Progress indicator for bulk operations (5/12 complete...)

**Key files to create/modify:**
- `app/api/bulk/health/route.ts` — bulk health check
- `app/api/bulk/backup/route.ts` — bulk backup
- `app/components/FleetSummary.tsx` — summary bar component
- `app/page.tsx` — integrate summary and bulk action buttons

---

## Implementation Waves

### Wave 1 — Foundation (3 parallel agents)

| Agent | Feature | Rationale |
|-------|---------|-----------|
| A | Feature 5: File Content Viewer | Foundational — unlocks Feature 3 and editing |
| B | Feature 6: Dashboard UX Overhaul | Independent, improves everything |
| C | Feature 1: Agent-Level Health | Top priority, restructures core UX |

### Wave 2 — Core Capabilities (3 parallel agents)

| Agent | Feature | Rationale |
|-------|---------|-----------|
| D | Feature 3: Skills/Memory Browser | Needs file viewer from Wave 1 |
| E | Feature 2: Agent Migration | Needs agent-level actions from Wave 1 |
| F | Feature 7: Action Log | Independent but more valuable after Wave 1 |

### Wave 3 — Intelligence Layer (2 parallel agents)

| Agent | Feature | Rationale |
|-------|---------|-----------|
| G | Feature 4: Manager Agent / Standup | Needs chat API confirmed + action log for history |
| H | Feature 8: Bulk Operations | Needs agent-level health from Wave 1 |

## 2026-03-02 — user-value

### Do it
1. **`reef insights` — Fleet Knowledge Query** — Effort: M — Status: done/PR
   - Branch: feat/fleet-insights-mcp
   - PR: https://github.com/jjackson/reef/pull/5
   - Outcome: Created lib/insights.ts with 3 functions (getAgentKnowledge, getFleetKnowledge, findSkill), CLI command with 3 modes (fleet-wide, per-agent, skill search), 6 new tests

2. **Reef MCP Server — Conversational Fleet Access** — Effort: L — Status: done/PR
   - Branch: feat/fleet-insights-mcp (same PR)
   - Outcome: Created bin/reef-mcp.ts with 9 read-only tools using @modelcontextprotocol/sdk. Covers instances, agents, knowledge, health, file browsing.

### Backlog
1. **`reef transfer-skill`** — Effort: M — Why not now: "Good idea, wants insights working first before skill transfer. Foundational knowledge query needed first."

### Closed
(none)

### Meta-observations
- Subagent-driven development worked well for this — fresh context per task, clean TDD
- Code quality review caught real issues (FileEntry name collision, command injection, SSH connection count)
- Batching Tasks 5-7 (MCP server) into one subagent was more efficient than three separate dispatches
- The user's vision goes beyond just fleet management — they want fleet learning, skill sharing, and eventually a self-improving agent network
- MCP server may become the primary interface for qualitative queries; CLI stays for actions

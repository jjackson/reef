## 2026-03-03 — User Value

### Do it
(none)

### Backlog
1. **`reef transfer-skill` command** — Effort: M — Why not now: good idea, not the priority right now
   - Copy skill directories between instances via tar + SFTP
   - Infrastructure ready: `sftpPull`/`sftpPush` in lib/ssh.ts, `readSkills()` in lib/insights.ts

2. **`reef health-all` fleet health command** — Effort: S — Why not now: backlogged for later
   - Parallel health checks across all instances with aggregated summary + alerts
   - Would replace running `reef health` 9 times individually

3. **`reef insights --compare` and `--unique`** — Effort: M — Why not now: backlogged for later
   - Compare two instances side-by-side, find unique skills across fleet
   - Directly supports fleet-learning vision: prioritize skill transfer targets

### Closed
(none)

### Meta-observations
- All 3 proposals landed in backlog — user-value lens found the right features but timing isn't right
- The interactive proposal menu (AskUserQuestion with per-item disposition) worked well — each proposal got independent disposition without bulk chat
- User-value lens naturally gravitates toward the "fleet learning" roadmap items; these are genuine next-frontier features
- Scout confirmed that infrastructure (SSH primitives, insights reading) is ready — implementation is mostly glue code when the time comes

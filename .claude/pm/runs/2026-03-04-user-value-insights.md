## 2026-03-04 — User Value (Collective Learning Insights)

### Do it
1. **"Learning Opportunities" section in HTML report** — Effort: S — Status: done
   - Commit: pending (on main)
   - Added `renderLearningOpportunities()` to `lib/report-html.ts`
   - Two subsections: "Skills to Spread" (unique skills on 1 instance) and "Recently Evolved" (skills modified in last 7 days)
   - Skills-only focus per user feedback (memories just represent usage, not interesting)
   - Dropped "knowledge gaps" subsection per user feedback (some agents not using skills yet, gap analysis not useful)

### Backlog
1. **Skill comparison view in HTML report** — Effort: M — Why not now: backlogged for later
   - Clickable shared skills in matrix expand to side-by-side content comparison
   - Shows date, size, content diffs per instance

### Closed
1. **`reef search <query>` fleet-wide search** — Why: user closed, no specific feedback
   - Learning: fleet-wide text search may not be the right UX for collective learning

### Meta-observations
- User cares about skills as the unit of collective learning, NOT memories (memories = usage artifacts)
- Knowledge gaps analysis isn't useful when adoption is uneven — only surface positive signals (what's spreading, what's evolving)
- The lens "collective learning" naturally focuses on skill sharing and evolution tracking
- Interactive per-proposal disposition continues to work well for PM cycles

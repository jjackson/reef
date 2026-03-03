## 2026-03-03 — Trust & Reliability

### Do it
1. **SSH connection timeouts and cleanup** — Effort: M — Status: done
   - Commit: pending (on main)
   - Added `readyTimeout: 15000` to all 4 SSH functions
   - Added application-level `withTimeout` wrapper (120s) on `runCommand`, `sftpPull`, `sftpPush`
   - Added `conn.end()` in all error handlers (previously leaked connections)
   - `backupDirectory` now checks tar exit code, throws on failure instead of downloading corrupt archive

2. **Harden settings.json against silent corruption** — Effort: S — Status: done
   - Commit: pending (on main)
   - `loadSettings` now logs a warning on parse failure instead of silently returning empty
   - `writeSettings` and `addToNameMap` use atomic write (write to temp, rename) to prevent corruption on crash
   - Fixed `reef doctor` CLI always reporting `success: true` — now reflects actual exit code

### Backlog
(none)

### Closed
1. **1Password singleton poisoning** — Why: user closed — not worth fixing
   - The `clientPromise` singleton is permanently poisoned on first rejection, but user decided this isn't worth addressing (likely because restarts are easy and 1Password failures are rare)
   - Learning: don't re-propose 1Password singleton recovery

### Meta-observations
- Trust & reliability lens found high-value, concrete bugs — every finding pointed to specific files and failure scenarios
- SSH timeout issues are the highest-impact class: one dead instance can block the entire fleet API
- The atomic write pattern for settings.json is a small change with outsized impact — prevents silent data loss
- Exploration agents working in parallel (error patterns + resource management) efficiently covered the full surface area

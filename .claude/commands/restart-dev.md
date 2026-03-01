---
name: restart-dev
description: Restart the Next.js dev server (kills port 3050, clears .next cache, bumps version)
---

Run `bash bin/dev.sh` in a foreground shell to restart the dev server. Do NOT background it or use `run_in_background` — the script uses `exec` which breaks when backgrounded with output redirection. Wait for the "Ready" message to confirm it started successfully.

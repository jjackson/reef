# Product Management Learnings

Items closed or rejected during PM cycles. Read this before every scout run to avoid re-proposing.

## Closed Items
- **1Password singleton poisoning** (2026-03-03, trust-reliability): don't re-propose recovery logic for the 1Password client singleton

## Preferences
- User pushes directly to main (solo developer, no PRs needed for small changes)
- Values meaningful tests only — don't propose adding tests that just verify mocks
- Prefers full droplet names as labels, not shortened names

## Skill Improvement Ideas
- **Interactive proposal menu**: Phase 2 (Propose) should use AskUserQuestion or similar to present each proposal individually with per-item disposition options (Do it / Backlog / Close / Redirect) and a field for specific feedback per item, rather than listing all proposals and asking for bulk feedback in chat

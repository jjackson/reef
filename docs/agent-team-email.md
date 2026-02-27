Your AI agents are set up and ready to go. Here's what you need to know.

## How it works

Each agent runs on a cloud server and can be reached via two channels:

- **Gmail** — email the agent's @dimagi-ai.com address and it will respond by email
- **Telegram** — message the agent's Telegram bot for real-time chat

## Your agents

| Agent | Machine | Shared? |
|-------|---------|---------|
| Eva | openclaw-eva | Dedicated |
| Hal | openclaw-hal | Shared with Ada |
| Ada | openclaw-hal | Shared with Hal |
| Dot | openclaw-dot | Dedicated |
| Myri | openclaw-myri | Dedicated |
| Twix | openclaw-twix | Shared with Wiz, Flurry |
| Wiz | openclaw-twix | Shared with Twix, Flurry |
| Flurry | openclaw-twix | Shared with Twix, Wiz |
| Jarvis | openclaw-jarvis | Dedicated |
| Fizzy | openclaw-fizzy | Dedicated |

## Telegram setup

Each phone number that wants to message an agent via Telegram needs to be explicitly approved. To get set up:

1. Find the agent's Telegram bot and send it a message
2. It will give you a pairing code
3. Send me the pairing code and I'll approve it

Until your number is approved, the agent won't respond.

## Shared machines — what to watch for

Some agents share a server. This works fine most of the time, but if you notice slowness or unresponsiveness, it may be because multiple agents on the same machine are all active at once. They share CPU and memory, so heavy usage from one agent can affect the others.

If this becomes an issue, let me know — I can move your agent to its own dedicated machine. We've already done this for Jarvis (moved off a shared machine) and it made a noticeable difference.

## If something seems off

- **Slow responses or timeouts** — the agent may be under resource pressure, especially on shared machines. Let me know and I can investigate.
- **No response at all** — the agent's gateway service may have crashed. Reach out to me and I can restart it.
- **Gmail not working** — OAuth tokens can expire. I'll need to re-authorize on the server side.

Let me know once you've sent your Telegram pairing codes and I'll get everyone approved.

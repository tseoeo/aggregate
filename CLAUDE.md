# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Daily Summary Aggregator - a news.smol.ai-style site that creates AI-powered daily digests from Discord servers. Built with Astro + Tailwind, uses OpenRouter (GPT-5.1) for summarization, deployed on Vercel.

## Commands

```bash
npm run dev              # Start Astro dev server (localhost:4321)
npm run build            # Build static site to dist/
npm run preview          # Preview built site locally

npm run fetch-discord    # Fetch messages from configured Discord channels
npm run summarize        # Run AI summarization on fetched data
npm run generate-daily   # Run both fetch + summarize (used by CI)
```

## Architecture

```
Discord Fetch → AI Summarization → Static Site Generation
   (scripts/)       (scripts/)          (src/)
```

**Data Flow:**
1. `fetch-discord.ts` pulls messages using user token → saves to `data/raw/{date}.json`
2. `summarize.ts` sends to OpenRouter → saves to `data/issues/{date}.json`
3. Astro builds pages from `data/issues/*.json` at build time

**Key Directories:**
- `scripts/lib/` - Discord client, OpenRouter client, shared types
- `config/sources.json` - Discord servers/channels to monitor
- `data/issues/` - Generated summaries (committed to repo)
- `data/raw/` - Raw fetched data (gitignored)

## Configuration

**Environment Variables** (create `.env` from `.env.example`):
- `DISCORD_TOKEN` - Discord user token (self-bot, ToS risk)
- `OPENROUTER_API_KEY` - OpenRouter API key

**Discord Sources** (`config/sources.json`):
```json
{
  "discord": {
    "servers": [{ "id": "SERVER_ID", "name": "Name", "channels": ["CHANNEL_ID"] }]
  }
}
```

## Automation

GitHub Actions runs daily at 02:00 UTC (`.github/workflows/daily-update.yml`):
1. Fetches Discord messages
2. Generates AI summary
3. Commits new data
4. Vercel auto-deploys on push

**Secrets required in GitHub:** `DISCORD_TOKEN`, `OPENROUTER_API_KEY`

## Extending Sources

The architecture supports adding new sources. Create `scripts/fetch-{source}.ts` that outputs to the same `RawDailyData` format, then update `generate-daily.ts` to call it.

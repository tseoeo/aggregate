# Project Status: i see all

Daily summary aggregator for Discord server discussions. Built with Astro + Tailwind, uses OpenRouter (GPT-5.1) for AI summarization, hosted on Vercel.

## Current State: Fully Functional

Last updated: 2026-01-11

---

## Architecture

```
Discord Servers ──> fetch-discord.ts ──> data/raw/{serverId}/{date}.json
                                              │
                                              ▼
                    summarize.ts (GPT-5.1) ──> data/issues/{serverId}/{date}.json
                                              │
                                              ▼
                    Astro Site ──> Vercel (auto-deploy on push)
```

---

## Configured Servers

| Server | ID | Channels |
|--------|-----|----------|
| Bellingcat | 709752884257882135 | all |
| Furlough | 742156704203931681 | seo, geo, ai (IDs: 742438469472878754, 1379865978384420874, 1357769830341673161) |

Config file: `config/sources.json`

---

## Features Implemented

### Core
- [x] Discord message fetching via user token (discord.js-selfbot-v13)
- [x] AI summarization via OpenRouter (GPT-5.1)
- [x] Channel-based summaries with highlights (tool, research, news, discussion, resource)
- [x] Per-server data storage structure

### UI
- [x] Site named "i see all" (lowercase)
- [x] Dark/light theme toggle
- [x] Server tabs with instant client-side switching (no page reload)
- [x] Collapsible channel sections
- [x] Discord message links on each highlight
- [x] External links preserved from message content

### Automation
- [x] GitHub Actions workflow runs daily at 02:00 UTC
- [x] Auto-commits generated data
- [x] Vercel auto-deploys on push

---

## Key Files

### Scripts
| File | Purpose |
|------|---------|
| `scripts/fetch-discord.ts` | Fetches messages from configured Discord servers |
| `scripts/summarize.ts` | Sends messages to GPT-5.1, generates summaries |
| `scripts/generate-daily.ts` | Orchestrates fetch + summarize |
| `scripts/lib/discord-client.ts` | Discord API wrapper |
| `scripts/lib/openrouter.ts` | OpenRouter API client with retry logic |
| `scripts/lib/types.ts` | TypeScript interfaces |

### Site
| File | Purpose |
|------|---------|
| `src/pages/index.astro` | Homepage with server tabs |
| `src/pages/issue/[serverId]/[date].astro` | Individual issue page |
| `src/components/ChannelSection.astro` | Collapsible channel with highlights |
| `src/components/IssueCard.astro` | Issue preview card |
| `src/layouts/Base.astro` | Base layout with header/footer |

### Config
| File | Purpose |
|------|---------|
| `config/sources.json` | Discord servers and channels to monitor |
| `.github/workflows/daily-update.yml` | GitHub Actions automation |

---

## Data Structure

```
data/
├── raw/
│   ├── {serverId}/
│   │   └── {date}.json      # Raw Discord messages
├── issues/
│   ├── {serverId}/
│   │   └── {date}.json      # AI-generated summaries
```

### Issue JSON Schema
```json
{
  "date": "2026-01-11",
  "serverId": "709752884257882135",
  "serverName": "Bellingcat",
  "title": "Bellingcat - January 11, 2026",
  "generatedAt": "2026-01-11T05:56:00.000Z",
  "channels": [
    {
      "channel": "channel-name",
      "status": "active",
      "summary": "Brief overview",
      "highlights": [
        {
          "type": "tool",
          "title": "Tool Name",
          "details": "Description",
          "link": "https://...",
          "discordLink": "https://discord.com/channels/...",
          "messageId": "1234567890"
        }
      ],
      "mentions": ["Person", "Tool"]
    }
  ],
  "stats": {
    "totalMessages": 795,
    "activeChannels": 11,
    "sourcesUsed": ["discord:Bellingcat#channel-name"]
  }
}
```

---

## Environment Variables

Required in `.env` and GitHub Secrets:
```
DISCORD_TOKEN=user_token_here
OPENROUTER_API_KEY=sk-or-...
```

---

## Commands

```bash
# Development
npm run dev              # Start local dev server

# Data generation
npm run fetch-discord    # Fetch Discord messages
npm run summarize        # Generate AI summaries
npm run generate-daily   # Run both (used by GitHub Actions)

# Build
npm run build           # Build for production
```

---

## Deployment

- **Repository**: https://github.com/tseoeo/aggregate.git
- **Hosting**: Vercel (auto-deploys on push to main)
- **Automation**: GitHub Actions at 02:00 UTC daily

---

## Known Limitations

1. **Discord ToS**: Using user token (self-bot) violates Discord ToS. Account could be banned.
2. **Message limit**: Fetches max 100 messages per channel
3. **Token limits**: AI processes max 150 messages per server to stay within context
4. **Channel filters**: Some channels are auto-excluded (logs, welcome, games, etc.) in `openrouter.ts`

---

## Recent Changes (2026-01-11)

1. Added multi-server support with per-server data structure
2. Added server tabs with instant client-side switching
3. Added collapsible channel sections
4. Added Discord message links to highlights
5. Renamed site to "i see all"
6. Added Furlough server (seo, geo, ai channels)

---

## Next Steps / Ideas

- [ ] Add more Discord servers
- [ ] Add Reddit/Twitter/RSS sources
- [ ] Search functionality
- [ ] Tag filtering
- [ ] Email digest option
- [ ] Migrate to proper Discord bot (to avoid ToS issues)

/**
 * Historical Discord channel fetcher for research purposes.
 *
 * Fetches message history going back 1 year from channels defined in
 * config/research-channels.json. Designed to behave like a human casually
 * browsing: slow, randomized delays, round-robin across channels, resumable.
 *
 * Usage:
 *   npx tsx scripts/research-fetch.ts [--duration <minutes>]
 *
 * Data is saved as JSONL to data/raw/research/{serverId}/{channelId}.jsonl
 * Progress is tracked in data/raw/research/progress.json
 */

import 'dotenv/config';
import { Client } from 'discord.js-selfbot-v13';
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  existsSync,
} from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelConfig {
  id: string;
  name: string;
}

interface ServerConfig {
  id: string;
  name: string;
  channels: ChannelConfig[];
}

interface ResearchConfig {
  servers: ServerConfig[];
}

interface ChannelProgress {
  oldestMessageId: string | null;
  totalMessages: number;
  complete: boolean;
  lastFetchedAt: string;
}

interface ProgressFile {
  channels: Record<string, ChannelProgress>; // keyed by channelId
}

interface ResearchMessage {
  id: string;
  content: string;
  author: { username: string; displayName: string };
  channelId: string;
  channelName: string;
  serverId: string;
  serverName: string;
  timestamp: string;
  reactionCount: number;
  replyCount: number;
}

// ---------------------------------------------------------------------------
// Delay utilities — gaussian-ish distribution for human-like timing
// ---------------------------------------------------------------------------

/** Box-Muller transform: returns a sample from N(mean, stddev). */
function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

/** Returns a delay in ms drawn from a gaussian, clamped to [min, max]. */
function randomDelay(
  meanSec: number,
  stddevSec: number,
  minSec: number,
  maxSec: number
): number {
  const sec = Math.min(maxSec, Math.max(minSec, gaussianRandom(meanSec, stddevSec)));
  return Math.round(sec * 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Random integer in [min, max] inclusive. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Progress persistence
// ---------------------------------------------------------------------------

const PROGRESS_PATH = 'data/raw/research/progress.json';

function loadProgress(): ProgressFile {
  if (existsSync(PROGRESS_PATH)) {
    return JSON.parse(readFileSync(PROGRESS_PATH, 'utf-8'));
  }
  return { channels: {} };
}

function saveProgress(progress: ProgressFile): void {
  mkdirSync('data/raw/research', { recursive: true });
  writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

function getChannelProgress(
  progress: ProgressFile,
  channelId: string
): ChannelProgress {
  return (
    progress.channels[channelId] ?? {
      oldestMessageId: null,
      totalMessages: 0,
      complete: false,
      lastFetchedAt: '',
    }
  );
}

// ---------------------------------------------------------------------------
// JSONL writer
// ---------------------------------------------------------------------------

function appendMessages(
  serverId: string,
  channelId: string,
  messages: ResearchMessage[]
): void {
  const dir = `data/raw/research/${serverId}`;
  mkdirSync(dir, { recursive: true });
  const filePath = `${dir}/${channelId}.jsonl`;
  const lines = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
  appendFileSync(filePath, lines);
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseDuration(): number {
  const idx = process.argv.indexOf('--duration');
  if (idx !== -1 && process.argv[idx + 1]) {
    const mins = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(mins) && mins > 0) return mins;
  }
  return 45; // default 45 minutes
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('DISCORD_TOKEN environment variable is required');
    process.exit(1);
  }

  const durationMin = parseDuration();
  const durationMs = durationMin * 60 * 1000;
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Load config
  const config: ResearchConfig = JSON.parse(
    readFileSync('config/research-channels.json', 'utf-8')
  );

  // Build a flat list of channels with their server info
  const allChannels: { server: ServerConfig; channel: ChannelConfig }[] = [];
  for (const server of config.servers) {
    for (const channel of server.channels) {
      allChannels.push({ server, channel });
    }
  }

  // Load progress and determine active channels
  const progress = loadProgress();
  const activeChannels = allChannels.filter(
    ({ channel }) => !getChannelProgress(progress, channel.id).complete
  );
  const completedCount = allChannels.length - activeChannels.length;

  // Startup summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Research Fetch — Historical Discord Fetcher`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Session duration : ${durationMin} minutes`);
  console.log(`  Cutoff date      : ${oneYearAgo.toISOString().split('T')[0]}`);
  console.log(`  Total channels   : ${allChannels.length}`);
  console.log(`  Completed        : ${completedCount}`);
  console.log(`  Remaining        : ${activeChannels.length}`);

  let totalPreviousMessages = 0;
  for (const { channel } of allChannels) {
    totalPreviousMessages += getChannelProgress(progress, channel.id).totalMessages;
  }
  console.log(`  Messages (prior) : ${totalPreviousMessages.toLocaleString()}`);
  console.log(`${'═'.repeat(60)}\n`);

  if (activeChannels.length === 0) {
    console.log('All channels are complete. Nothing to do.');
    return;
  }

  // Connect to Discord
  const client = new Client({ checkUpdate: false } as any);

  await new Promise<void>((resolve, reject) => {
    client.once('ready', () => {
      console.log(`Logged in as ${client.user?.tag}\n`);
      resolve();
    });
    client.login(token).catch(reject);
  });

  // Prefetch guild channel caches
  const guildIds = [...new Set(config.servers.map((s) => s.id))];
  for (const guildId of guildIds) {
    let guild = client.guilds.cache.get(guildId);
    if (!guild) {
      guild = await client.guilds.fetch(guildId);
    }
    await guild.channels.fetch();
  }

  // Session state
  const sessionStart = Date.now();
  let sessionMessages = 0;
  let requestsSinceLastPause = 0;
  let nextPauseAfter = randInt(8, 15);
  let slowdownRemaining = 0; // requests at reduced pace after a 429

  // Round-robin index
  let rrIndex = 0;

  // Graceful shutdown
  let stopping = false;
  process.on('SIGINT', () => {
    console.log('\n\nReceived SIGINT — finishing current fetch then stopping...');
    stopping = true;
  });

  // Main loop: round-robin through active channels
  while (!stopping) {
    // Time check
    const elapsed = Date.now() - sessionStart;
    if (elapsed >= durationMs) {
      console.log(`\nSession duration reached (${durationMin} min). Stopping.`);
      break;
    }

    // Filter out channels that became complete during this session
    const stillActive = activeChannels.filter(
      ({ channel }) => !getChannelProgress(progress, channel.id).complete
    );

    if (stillActive.length === 0) {
      console.log('\nAll channels are now complete!');
      break;
    }

    // Pick next channel (round-robin)
    rrIndex = rrIndex % stillActive.length;
    const { server, channel } = stillActive[rrIndex];
    rrIndex++;

    const cp = getChannelProgress(progress, channel.id);

    // Fetch one page
    const guild = client.guilds.cache.get(server.id);
    if (!guild) continue;

    const discordChannel = guild.channels.cache.get(channel.id) as any;
    if (!discordChannel || !discordChannel.messages) {
      console.warn(`  Channel not accessible: #${channel.name} — marking complete`);
      cp.complete = true;
      progress.channels[channel.id] = cp;
      saveProgress(progress);
      continue;
    }

    try {
      const fetchOptions: { limit: number; before?: string } = { limit: 100 };
      if (cp.oldestMessageId) {
        fetchOptions.before = cp.oldestMessageId;
      }

      const fetched = await discordChannel.messages.fetch(fetchOptions);
      requestsSinceLastPause++;

      if (fetched.size === 0) {
        cp.complete = true;
        cp.lastFetchedAt = new Date().toISOString();
        progress.channels[channel.id] = cp;
        saveProgress(progress);
        console.log(
          `  #${channel.name} (${server.name}) — no more messages, marked complete`
        );
        continue;
      }

      // Process messages — they come newest-first from the API
      const messages: ResearchMessage[] = [];
      let oldestTimestamp = Infinity;
      let oldestId: string | null = null;
      let hitCutoff = false;

      for (const msg of fetched.values()) {
        const ts = msg.createdTimestamp;

        if (ts < oneYearAgo.getTime()) {
          hitCutoff = true;
          continue; // skip messages older than 1 year
        }

        if (ts < oldestTimestamp) {
          oldestTimestamp = ts;
          oldestId = msg.id;
        }

        const totalReactions = msg.reactions.cache.reduce(
          (sum, r) => sum + (r.count || 0),
          0
        );

        messages.push({
          id: msg.id,
          content: msg.content,
          author: {
            username: msg.author.username,
            displayName: msg.author.displayName || msg.author.username,
          },
          channelId: channel.id,
          channelName: channel.name,
          serverId: server.id,
          serverName: server.name,
          timestamp: msg.createdAt.toISOString(),
          reactionCount: totalReactions,
          replyCount: msg.thread?.messageCount || 0,
        });
      }

      // If we hit the cutoff or got fewer than 100 messages with all of them
      // older than the cutoff, this channel is done
      if (hitCutoff) {
        cp.complete = true;
      }

      // Update progress
      if (oldestId) {
        cp.oldestMessageId = oldestId;
      } else if (hitCutoff) {
        // All messages on this page were older than cutoff
        cp.complete = true;
      }

      cp.totalMessages += messages.length;
      cp.lastFetchedAt = new Date().toISOString();
      progress.channels[channel.id] = cp;

      // Persist
      if (messages.length > 0) {
        appendMessages(server.id, channel.id, messages);
      }
      saveProgress(progress);
      sessionMessages += messages.length;

      // Console output
      const oldestDate = oldestTimestamp < Infinity
        ? new Date(oldestTimestamp).toISOString().split('T')[0]
        : 'n/a';
      const status = cp.complete ? ' [COMPLETE]' : '';
      console.log(
        `  #${channel.name} (${server.name}) — ` +
          `${messages.length} msgs, oldest: ${oldestDate}, ` +
          `total: ${cp.totalMessages.toLocaleString()}${status}`
      );
    } catch (error: any) {
      // Rate limit handling
      if (
        error?.httpStatus === 429 ||
        error?.message?.includes('rate limit') ||
        error?.code === 429
      ) {
        const backoffSec = randInt(60, 120);
        console.log(
          `\n  ⚠ Rate limited! Backing off for ${backoffSec}s...`
        );
        await sleep(backoffSec * 1000);
        slowdownRemaining = 20;
        continue;
      }

      console.error(
        `  Error on #${channel.name}: ${error?.message || error}`
      );
      // Skip this channel for now but don't mark complete
      continue;
    }

    // --- Pacing ---

    // "Reading pause" every 8–15 requests
    if (requestsSinceLastPause >= nextPauseAfter) {
      const pauseSec = randInt(15, 45);
      console.log(`  Reading pause (${pauseSec}s)...`);
      await sleep(pauseSec * 1000);
      requestsSinceLastPause = 0;
      nextPauseAfter = randInt(8, 15);
    } else {
      // Normal inter-request delay (gaussian around 5s, clamped 3–8s)
      // If in slowdown mode after a 429, double the delay
      const multiplier = slowdownRemaining > 0 ? 2 : 1;
      const delayMs = randomDelay(5, 1.2, 3, 8) * multiplier;
      await sleep(delayMs);

      if (slowdownRemaining > 0) slowdownRemaining--;
    }
  }

  // Session summary
  const elapsedMin = ((Date.now() - sessionStart) / 60000).toFixed(1);
  let totalAllTime = 0;
  let completedNow = 0;
  for (const { channel } of allChannels) {
    const cp = getChannelProgress(progress, channel.id);
    totalAllTime += cp.totalMessages;
    if (cp.complete) completedNow++;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Session Summary`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Duration            : ${elapsedMin} minutes`);
  console.log(`  Messages this session: ${sessionMessages.toLocaleString()}`);
  console.log(`  Messages all-time   : ${totalAllTime.toLocaleString()}`);
  console.log(`  Channels completed  : ${completedNow} / ${allChannels.length}`);
  console.log(`${'═'.repeat(60)}\n`);

  client.destroy();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

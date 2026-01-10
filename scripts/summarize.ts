import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { OpenRouterClient } from './lib/openrouter.js';
import type { RawDailyData } from './lib/types.js';

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY environment variable is required');
    process.exit(1);
  }

  // Find the latest raw data file (or use provided date argument)
  const dateArg = process.argv[2];
  const rawDataDir = './data/raw';
  const issuesDir = './data/issues';

  if (!existsSync(rawDataDir)) {
    console.error('No raw data directory found. Run fetch-discord first.');
    process.exit(1);
  }

  // Ensure issues directory exists
  if (!existsSync(issuesDir)) {
    mkdirSync(issuesDir, { recursive: true });
  }

  let targetDate: string;
  if (dateArg) {
    targetDate = dateArg;
  } else {
    // Find the latest file
    const files = readdirSync(rawDataDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.error('No raw data files found. Run fetch-discord first.');
      process.exit(1);
    }
    targetDate = files[0].replace('.json', '');
  }

  const rawDataPath = `${rawDataDir}/${targetDate}.json`;
  if (!existsSync(rawDataPath)) {
    console.error(`Raw data file not found: ${rawDataPath}`);
    process.exit(1);
  }

  console.log(`Summarizing data for ${targetDate}...`);

  const rawData: RawDailyData = JSON.parse(readFileSync(rawDataPath, 'utf-8'));

  if (rawData.discord.length === 0) {
    console.log('No messages to summarize.');
    process.exit(0);
  }

  // Use GPT-5.1 via OpenRouter
  const client = new OpenRouterClient(apiKey, 'openai/gpt-5.1');

  console.log(`Processing ${rawData.discord.length} messages...`);
  const issue = await client.summarize(rawData.discord, targetDate);

  const outputPath = `${issuesDir}/${targetDate}.json`;
  writeFileSync(outputPath, JSON.stringify(issue, null, 2));
  console.log(`Saved issue to ${outputPath}`);

  const activeChannels = issue.channels.filter(c => c.status === 'active');
  const quietChannels = issue.channels.filter(c => c.status === 'not-important');

  console.log(`\nGenerated summary for ${issue.channels.length} channels:`);
  console.log(`  Active: ${activeChannels.length}`);
  for (const ch of activeChannels) {
    console.log(`    - #${ch.channel}`);
  }
  console.log(`  Quiet: ${quietChannels.length}`);
  for (const ch of quietChannels) {
    console.log(`    - #${ch.channel}`);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

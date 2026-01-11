import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { OpenRouterClient } from './lib/openrouter.js';
import type { RawServerData, SourcesConfig } from './lib/types.js';

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY environment variable is required');
    process.exit(1);
  }

  // Load config to get server list
  const configPath = './config/sources.json';
  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }

  const config: SourcesConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
  const dateArg = process.argv[2];
  const today = dateArg || new Date().toISOString().split('T')[0];

  // Use GPT-5.1 via OpenRouter
  const client = new OpenRouterClient(apiKey, 'openai/gpt-5.1');

  // Process each server
  for (const server of config.discord.servers) {
    const rawDataDir = `./data/raw/${server.id}`;
    const issuesDir = `./data/issues/${server.id}`;

    // Ensure issues directory exists
    if (!existsSync(issuesDir)) {
      mkdirSync(issuesDir, { recursive: true });
    }

    // Find the target date file
    let targetDate = today;
    if (!dateArg && existsSync(rawDataDir)) {
      const files = readdirSync(rawDataDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse();

      if (files.length > 0) {
        targetDate = files[0].replace('.json', '');
      }
    }

    const rawDataPath = `${rawDataDir}/${targetDate}.json`;
    if (!existsSync(rawDataPath)) {
      console.log(`No raw data for ${server.name} (${server.id}) on ${targetDate}, skipping...`);
      continue;
    }

    console.log(`\nSummarizing ${server.name} for ${targetDate}...`);

    const rawData: RawServerData = JSON.parse(readFileSync(rawDataPath, 'utf-8'));

    if (rawData.messages.length === 0) {
      console.log(`No messages to summarize for ${server.name}.`);
      continue;
    }

    console.log(`Processing ${rawData.messages.length} messages...`);
    const issue = await client.summarize(rawData.messages, targetDate, server.id, server.name);

    const outputPath = `${issuesDir}/${targetDate}.json`;
    writeFileSync(outputPath, JSON.stringify(issue, null, 2));
    console.log(`Saved issue to ${outputPath}`);

    const activeChannels = issue.channels.filter(c => c.status === 'active');
    const quietChannels = issue.channels.filter(c => c.status === 'not-important');

    console.log(`Generated summary for ${issue.channels.length} channels:`);
    console.log(`  Active: ${activeChannels.length}`);
    for (const ch of activeChannels) {
      console.log(`    - #${ch.channel}`);
    }
    console.log(`  Quiet: ${quietChannels.length}`);
  }

  console.log('\nAll servers processed!');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

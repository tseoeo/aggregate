import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { DiscordFetcher } from './lib/discord-client.js';
import type { RawDailyData, SourcesConfig } from './lib/types.js';

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('DISCORD_TOKEN environment variable is required');
    process.exit(1);
  }

  // Load config
  const configPath = './config/sources.json';
  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    console.error('Please create config/sources.json with your Discord servers and channels');
    process.exit(1);
  }

  const config: SourcesConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

  // Create data directories if needed
  const rawDataDir = './data/raw';
  if (!existsSync(rawDataDir)) {
    mkdirSync(rawDataDir, { recursive: true });
  }

  // Initialize fetcher
  const fetcher = new DiscordFetcher(token);

  console.log('Connecting to Discord...');
  await fetcher.connect();

  console.log('Fetching messages...');
  const messages = await fetcher.fetchMessages(config.discord);

  console.log(`Fetched ${messages.length} messages total`);

  // Save raw data
  const today = new Date().toISOString().split('T')[0];
  const rawData: RawDailyData = {
    date: today,
    collectedAt: new Date().toISOString(),
    discord: messages,
  };

  const outputPath = `${rawDataDir}/${today}.json`;
  writeFileSync(outputPath, JSON.stringify(rawData, null, 2));
  console.log(`Saved raw data to ${outputPath}`);

  await fetcher.disconnect();
  console.log('Done!');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

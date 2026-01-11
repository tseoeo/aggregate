import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { DiscordFetcher } from './lib/discord-client.js';
import type { RawServerData, SourcesConfig } from './lib/types.js';

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
    process.exit(1);
  }

  const config: SourcesConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];

  // Initialize fetcher
  const fetcher = new DiscordFetcher(token);

  console.log('Connecting to Discord...');
  await fetcher.connect();

  // Fetch and save per server
  for (const server of config.discord.servers) {
    console.log(`\nFetching from ${server.name}...`);

    const messages = await fetcher.fetchMessagesFromServer(server);
    console.log(`Fetched ${messages.length} messages from ${server.name}`);

    // Create server directory
    const serverDir = `./data/raw/${server.id}`;
    if (!existsSync(serverDir)) {
      mkdirSync(serverDir, { recursive: true });
    }

    // Save raw data
    const rawData: RawServerData = {
      date: today,
      serverId: server.id,
      serverName: server.name,
      collectedAt: new Date().toISOString(),
      messages,
    };

    const outputPath = `${serverDir}/${today}.json`;
    writeFileSync(outputPath, JSON.stringify(rawData, null, 2));
    console.log(`Saved to ${outputPath}`);
  }

  await fetcher.disconnect();
  console.log('\nDone!');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

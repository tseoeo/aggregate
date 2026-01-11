import { Client } from 'discord.js-selfbot-v13';
import type { DiscordMessage } from './types.js';

interface ServerConfig {
  id: string;
  name: string;
  channels: string[] | 'all';
}

export class DiscordFetcher {
  private client: Client;
  private token: string;

  constructor(token: string) {
    this.client = new Client({ checkUpdate: false });
    this.token = token;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.once('ready', () => {
        console.log(`Logged in as ${this.client.user?.tag}`);
        resolve();
      });

      this.client.login(this.token).catch(reject);
    });
  }

  async disconnect(): Promise<void> {
    this.client.destroy();
  }

  async fetchMessagesFromServer(
    server: ServerConfig,
    hoursBack: number = 24,
    minReactions: number = 3
  ): Promise<DiscordMessage[]> {
    const messages: DiscordMessage[] = [];
    const cutoffTime = Date.now() - hoursBack * 60 * 60 * 1000;

    let guild = this.client.guilds.cache.get(server.id);
    if (!guild) {
      try {
        guild = await this.client.guilds.fetch(server.id);
      } catch {
        console.warn(`Server not found: ${server.name} (${server.id})`);
        return messages;
      }
    }

    // Fetch channels from API
    await guild.channels.fetch();

    // Get channels to fetch
    const textTypes = ['GUILD_TEXT', 'GUILD_NEWS', 0, 5];
    const channelsToFetch = server.channels === 'all'
      ? Array.from(guild.channels.cache
          .filter((ch) => textTypes.includes(ch.type as string | number))
          .keys())
      : server.channels;

    console.log(`Found ${channelsToFetch.length} channels to fetch`);

    for (const channelId of channelsToFetch) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel || !textTypes.includes(channel.type as string | number)) {
        console.warn(`Channel not found: ${channelId}`);
        continue;
      }

      try {
        const fetchedMessages = await channel.messages.fetch({ limit: 100 });

        for (const msg of fetchedMessages.values()) {
          const msgTime = msg.createdTimestamp;
          const totalReactions = msg.reactions.cache.reduce(
            (sum, r) => sum + (r.count || 0),
            0
          );

          if (msgTime >= cutoffTime || totalReactions >= minReactions) {
            messages.push({
              id: msg.id,
              serverId: server.id,
              content: msg.content,
              author: {
                id: msg.author.id,
                username: msg.author.username,
                displayName: msg.author.displayName || msg.author.username,
              },
              channelId: channel.id,
              channelName: channel.name,
              serverName: guild.name,
              timestamp: msg.createdAt.toISOString(),
              reactionCount: totalReactions,
              replyCount: msg.thread?.messageCount || 0,
            });
          }
        }

        console.log(`  #${channel.name}: ${fetchedMessages.size} messages`);
      } catch (error) {
        console.error(`Error fetching #${channel.name}:`, (error as Error).message);
      }
    }

    messages.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return messages;
  }
}

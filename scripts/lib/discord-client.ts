import { Client } from 'discord.js-selfbot-v13';
import type { DiscordMessage, DiscordSourceConfig } from './types.js';

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

  async fetchMessages(
    config: DiscordSourceConfig,
    hoursBack: number = 24,
    minReactions: number = 3
  ): Promise<DiscordMessage[]> {
    const messages: DiscordMessage[] = [];
    const cutoffTime = Date.now() - hoursBack * 60 * 60 * 1000;

    for (const server of config.servers) {
      let guild = this.client.guilds.cache.get(server.id);
      if (!guild) {
        // Try to fetch the guild if not in cache
        try {
          guild = await this.client.guilds.fetch(server.id);
        } catch {
          console.warn(`Server not found: ${server.name} (${server.id})`);
          continue;
        }
      }

      // Fetch channels from API to ensure we have them
      await guild.channels.fetch();

      // Get channels to fetch - either specific IDs or all text channels
      const textTypes = ['GUILD_TEXT', 'GUILD_NEWS', 0, 5]; // Support both string and numeric types
      const channelsToFetch = server.channels === 'all'
        ? Array.from(guild.channels.cache
            .filter((ch) => textTypes.includes(ch.type as string | number))
            .keys())
        : server.channels;

      console.log(`Found ${channelsToFetch.length} text channels to fetch in ${guild.name}`);

      for (const channelId of channelsToFetch) {
        const channel = guild.channels.cache.get(channelId);
        if (!channel || !textTypes.includes(channel.type as string | number)) {
          console.warn(`Channel not found or not text-based: ${channelId}`);
          continue;
        }

        try {
          // Fetch messages from the channel
          const fetchedMessages = await channel.messages.fetch({ limit: 100 });

          for (const msg of fetchedMessages.values()) {
            const msgTime = msg.createdTimestamp;
            const totalReactions = msg.reactions.cache.reduce(
              (sum, r) => sum + (r.count || 0),
              0
            );

            // Include if: within time window OR has enough reactions
            if (msgTime >= cutoffTime || totalReactions >= minReactions) {
              messages.push({
                id: msg.id,
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

          console.log(
            `Fetched ${fetchedMessages.size} messages from #${channel.name} in ${guild.name}`
          );
        } catch (error) {
          console.error(`Error fetching from channel ${channelId}:`, error);
        }
      }
    }

    // Sort by timestamp descending
    messages.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return messages;
  }
}

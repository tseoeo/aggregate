// Raw message data from Discord
export interface DiscordMessage {
  id: string;
  serverId: string;
  content: string;
  author: {
    id: string;
    username: string;
    displayName: string;
  };
  channelId: string;
  channelName: string;
  serverName: string;
  timestamp: string;
  reactionCount: number;
  replyCount: number;
  threadContext?: string;
}

// Raw data collected from all sources
export interface RawDailyData {
  date: string;
  collectedAt: string;
  discord: DiscordMessage[];
}

// Channel summary in a daily issue
export interface ChannelSummary {
  channel: string;
  status: 'active' | 'not-important';
  summary?: string;
  highlights?: {
    type: 'tool' | 'research' | 'news' | 'discussion' | 'resource';
    title: string;
    details: string;
    link?: string;
    discordLink?: string;
    messageId?: string;
  }[];
  mentions?: string[];
}

// Final daily issue structure
export interface DailyIssue {
  date: string;
  serverId: string;
  serverName: string;
  title: string;
  generatedAt: string;
  channels: ChannelSummary[];
  stats: {
    totalMessages: number;
    activeChannels: number;
    sourcesUsed: string[];
  };
}

// Raw data per server
export interface RawServerData {
  date: string;
  serverId: string;
  serverName: string;
  collectedAt: string;
  messages: DiscordMessage[];
}

// Configuration for Discord sources
export interface DiscordSourceConfig {
  servers: {
    id: string;
    name: string;
    channels: string[] | 'all';
  }[];
}

export interface SourcesConfig {
  discord: DiscordSourceConfig;
}

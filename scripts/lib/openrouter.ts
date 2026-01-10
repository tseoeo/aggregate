import type { DiscordMessage, DailyIssue, ChannelSummary } from './types.js';

interface OpenRouterResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

export class OpenRouterClient {
  private apiKey: string;
  private model: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor(apiKey: string, model: string = 'openai/gpt-4.5-preview') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async summarize(messages: DiscordMessage[], date: string): Promise<DailyIssue> {
    // Filter messages
    const filteredMessages = this.filterMessages(messages);
    console.log(`Using ${filteredMessages.length} messages after filtering (from ${messages.length})`);

    const prompt = this.buildPrompt(filteredMessages);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://daily-summary.vercel.app',
        'X-Title': 'Daily Summary',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You summarize Bellingcat Discord (OSINT/investigative journalism) discussions organized BY CHANNEL.

Return ONLY valid JSON (no markdown, no backticks):
{
  "channels": [
    {
      "channel": "channel-name",
      "status": "active",
      "summary": "Brief overview of channel activity",
      "highlights": [
        {
          "type": "tool|research|news|discussion|resource",
          "title": "Specific name of tool/topic/article",
          "details": "What it does, why it matters, key findings",
          "link": "URL if shared"
        }
      ],
      "mentions": ["Person or org mentioned", "Specific tool name"]
    },
    {
      "channel": "quiet-channel",
      "status": "not-important",
      "summary": "No significant activity"
    }
  ]
}

IMPORTANT RULES:
- Organize output BY CHANNEL, one entry per channel
- Use "status": "not-important" for channels with trivial/routine messages
- Use "status": "active" for channels with substantive content
- Be SPECIFIC: name exact tools (e.g., "Bellingcat Online Investigation Toolkit"), articles, research topics
- Include URLs when shared
- "highlights" should have specific, actionable items - not vague summaries
- "mentions" should list specific people, organizations, tools, or technologies discussed`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    let content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content in OpenRouter response');
    }

    // Clean up the response - remove markdown code blocks if present
    content = content.trim();
    if (content.startsWith('```json')) {
      content = content.slice(7);
    } else if (content.startsWith('```')) {
      content = content.slice(3);
    }
    if (content.endsWith('```')) {
      content = content.slice(0, -3);
    }
    content = content.trim();

    // Parse the JSON response
    let parsed: { channels: ChannelSummary[] };
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse JSON response:', content.slice(0, 500));
      throw new Error(`Invalid JSON response from API: ${(e as Error).message}`);
    }

    // Count active channels
    const activeChannels = (parsed.channels || []).filter(c => c.status === 'active').length;

    // Build the final issue
    const issue: DailyIssue = {
      date,
      title: this.generateTitle(date),
      generatedAt: new Date().toISOString(),
      channels: parsed.channels || [],
      stats: {
        totalMessages: messages.length,
        activeChannels,
        sourcesUsed: this.extractUniqueSources(filteredMessages),
      },
    };

    return issue;
  }

  private filterMessages(messages: DiscordMessage[]): DiscordMessage[] {
    // Filter out empty messages and excluded channels
    const skipChannels = [
      // Logs/Admin
      'log', 'mod-log', 'automod', 'modmail-log',
      // Server info
      'welcome', 'rules', 'faq', 'select-your-roles',
      // General chat
      'chit-chat', 'introductions', 'non-osint-discussion',
      // Off-topic
      'games', 'memes', 'music-videos-movies-etc', 'books', 'sports',
      'bellingcook', 'mental-health-and-rest',
      // Other
      'corona', 'hackathon', 'voicechat-chat', 'stage-talk-chat',
      'ragabosh', 'furballthegreat',
    ];

    let filtered = messages.filter(msg => {
      // Skip empty content
      if (!msg.content || msg.content.trim().length < 10) return false;
      // Skip excluded channels
      if (skipChannels.includes(msg.channelName)) return false;
      return true;
    });

    // Sort by channel, then by engagement, then by recency
    filtered.sort((a, b) => {
      if (a.channelName !== b.channelName) {
        return a.channelName.localeCompare(b.channelName);
      }
      if (b.reactionCount !== a.reactionCount) {
        return b.reactionCount - a.reactionCount;
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // Limit to top 150 messages to stay within token limits
    return filtered.slice(0, 150);
  }

  private buildPrompt(messages: DiscordMessage[]): string {
    const groupedByChannel = new Map<string, DiscordMessage[]>();

    for (const msg of messages) {
      const key = msg.channelName;
      if (!groupedByChannel.has(key)) {
        groupedByChannel.set(key, []);
      }
      groupedByChannel.get(key)!.push(msg);
    }

    let prompt = `Bellingcat Discord messages from the last 24 hours:\n\n`;

    for (const [channel, msgs] of groupedByChannel) {
      prompt += `## #${channel} (${msgs.length} messages)\n\n`;
      for (const msg of msgs.slice(0, 15)) { // Max 15 per channel
        const reactions = msg.reactionCount > 0 ? ` [${msg.reactionCount}👍]` : '';
        const content = msg.content.length > 400 ? msg.content.slice(0, 400) + '...' : msg.content;
        prompt += `**${msg.author.displayName}**${reactions}: ${content}\n\n`;
      }
    }

    return prompt;
  }

  private generateTitle(date: string): string {
    const d = new Date(date);
    const options: Intl.DateTimeFormatOptions = {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    };
    return `Daily Summary - ${d.toLocaleDateString('en-US', options)}`;
  }

  private extractUniqueSources(messages: DiscordMessage[]): string[] {
    const sources = new Set<string>();
    for (const msg of messages) {
      sources.add(`discord:${msg.serverName}#${msg.channelName}`);
    }
    return Array.from(sources);
  }
}

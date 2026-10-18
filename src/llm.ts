import Anthropic from '@anthropic-ai/sdk';
import { CallLimit } from './core/quota';
import { parseScores, REJECT_REASONS, type ChannelScore } from './core/channelScores';

const MODEL = 'claude-haiku-5-5';

export type ChannelForReview = {
  id: string; title: string; topic: string; subscribers: number;
  recentTitles: { title: string; daysAgo: number }[];
};

const SYSTEM = `You curate a private, knowledge-only short-video feed for one person in India who watches English, Hindi and Hinglish.
They want smart, accurate, fun creators. They are escaping social-media comparison, so lifestyle content is unwelcome.

Score each YouTube channel from 0 to 1 for this feed, judging only from its recent video titles and stats:
- consistency: posts regularly, recently, on the topic
- clarity: titles promise explanation or insight, not vague hype
- credibility: sounds like a journalist, scientist, doctor, chef or expert; health and news need a higher bar
- no clickbait (ALL CAPS, "you won't believe", fake urgency), no rage-bait or one-sided outrage
Hard rejects (set reject_reason): ${REJECT_REASONS.join(', ')}.
lifestyle_flex = luxury, "day in my life", flaunting wealth/success, motivational hustle, even if it claims to be about startups.
reposts = compilation/clip channels re-uploading others' content.
language: "en", "hi" or "hinglish". summary: under 12 words on why.`;

const SCHEMA = {
  type: 'object',
  properties: {
    channels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          score: { type: 'number' },
          language: { type: 'string', enum: ['en', 'hi', 'hinglish'] },
          reject_reason: { anyOf: [{ type: 'string', enum: [...REJECT_REASONS] }, { type: 'null' }] },
          summary: { type: 'string' },
        },
        required: ['id', 'score', 'language', 'reject_reason', 'summary'],
        additionalProperties: false,
      },
    },
  },
  required: ['channels'],
  additionalProperties: false,
};

export class Curator {
  private client: Anthropic;
  constructor(apiKey: string, private calls: CallLimit) {
    this.client = new Anthropic({ apiKey, maxRetries: 1 });
  }

  // One request scores a whole group of channels.
  async scoreChannels(group: ChannelForReview[]): Promise<ChannelScore[]> {
    const listing = group.map((c) => ({
      id: c.id, name: c.title, topic: c.topic, subscribers: c.subscribers,
      recent: c.recentTitles.map((t) => `${t.title} (${t.daysAgo}d ago)`),
    }));
    this.calls.take();
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: JSON.stringify(listing) }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    if (res.stop_reason === 'refusal') return [];
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    return parseScores(text, group.map((c) => c.id));
  }
}

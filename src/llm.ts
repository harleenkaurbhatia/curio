import Anthropic from '@anthropic-ai/sdk';
import { CallLimit } from './core/quota';
import { parseScores, REJECT_REASONS, type ChannelScore } from './core/channelScores';
import { parsePostScores, POST_REJECT_REASONS, type PostScore } from './core/postScores';

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

export type PostForReview = { id: string; topic: string; source: string; author: string | null; title: string; text: string };

const POST_SYSTEM = `You pick text posts and articles for a knowledge feed read in short breaks by curious people in India (English, Hindi, Hinglish).
Score each item 0 to 1: is it genuinely interesting, accurate and worth 30 seconds? Reward new facts, clear explanations, original insight, useful news context.
Health and news need a higher bar of credibility. Reject (set reject_reason): ${POST_REJECT_REASONS.join(', ')}.
lifestyle_flex = bragging, luxury, hustle-motivation, "I made $X". self_promo = mainly selling something. shallow = no real information.
hook: one plain line (under 14 words) saying why it's worth reading, in the item's language. No hype, no emojis.`;

const POST_SCHEMA = {
  type: 'object',
  properties: {
    posts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          score: { type: 'number' },
          reject_reason: { anyOf: [{ type: 'string', enum: [...POST_REJECT_REASONS] }, { type: 'null' }] },
          hook: { type: 'string' },
        },
        required: ['id', 'score', 'reject_reason', 'hook'],
        additionalProperties: false,
      },
    },
  },
  required: ['posts'],
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
    return parseScores(textOf(res), group.map((c) => c.id));
  }

  async screenPosts(group: PostForReview[]): Promise<PostScore[]> {
    this.calls.take();
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: POST_SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: POST_SCHEMA } },
      messages: [{ role: 'user', content: JSON.stringify(group) }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    if (res.stop_reason === 'refusal') return [];
    return parsePostScores(textOf(res), group.map((p) => p.id));
  }
}

const textOf = (res: Anthropic.Message) => res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');

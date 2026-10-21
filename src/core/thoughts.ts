// A thought like "less news, more science" or "this is clickbait" also steers that person's feed.
import type { Weights } from './ranking';
import { applyFeedback } from './feedback';

export type ThoughtIntent = { item: -1 | 0 | 1; more: string[]; less: string[] };
const NONE: ThoughtIntent = { item: 0, more: [], less: [] };

// Asking for a topic moves it a bit more than one 👍/👎, since it's an explicit wish.
const TOPIC = { up: 1.25, down: 0.75, min: 0.2, max: 3 };

export function parseThoughtIntent(raw: string, topicIds: Set<string>): ThoughtIntent {
  let r: any;
  try { r = JSON.parse(raw); } catch { return NONE; }
  const item = r?.item === 1 || r?.item === -1 ? r.item : 0;
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String).filter((t) => topicIds.has(t)))] : []);
  const more = ids(r?.more);
  const less = ids(r?.less).filter((t) => !more.includes(t));
  return { item, more, less };
}

export function applyThoughtIntent(w: Weights, intent: ThoughtIntent, on: { topic: string; channelId: string } | null): Weights {
  let out = on && intent.item ? applyFeedback(w, { ...on, rating: intent.item }) : w;
  if (!intent.more.length && !intent.less.length) return out;
  const topic = { ...out.topic };
  const move = (t: string, f: number) => (topic[t] = Math.min(TOPIC.max, Math.max(TOPIC.min, (topic[t] ?? 1) * f)));
  intent.more.forEach((t) => move(t, TOPIC.up));
  intent.less.forEach((t) => move(t, TOPIC.down));
  return { ...out, topic };
}

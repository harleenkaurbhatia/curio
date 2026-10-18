import type { Weights } from './ranking';

export type Rating = { topic: string; channelId: string; rating: 1 | -1 };

// Topics move gently (a 👎 on one video shouldn't kill a whole topic); creators move faster.
const STEP = { topic: { up: 1.15, down: 0.8, min: 0.2, max: 3 }, channel: { up: 1.2, down: 0.6, min: 0.1, max: 3 } };

const nudge = (cur: number | undefined, s: (typeof STEP)['topic'], rating: 1 | -1) =>
  Math.min(s.max, Math.max(s.min, (cur ?? 1) * (rating > 0 ? s.up : s.down)));

export function applyFeedback(w: Weights, f: Rating): Weights {
  return {
    topic: { ...w.topic, [f.topic]: nudge(w.topic[f.topic], STEP.topic, f.rating) },
    channel: { ...w.channel, [f.channelId]: nudge(w.channel[f.channelId], STEP.channel, f.rating) },
  };
}

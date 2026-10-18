import { describe, it, expect } from 'vitest';
import { applyFeedback } from '../src/core/feedback';
import type { Weights } from '../src/core/ranking';

const empty = (): Weights => ({ topic: {}, channel: {} });

describe('applyFeedback', () => {
  it('👍 raises and 👎 lowers topic and creator weights from a default of 1', () => {
    const up = applyFeedback(empty(), { topic: 'tech', channelId: 'c', rating: 1 });
    expect(up.topic.tech).toBeCloseTo(1.15);
    expect(up.channel.c).toBeCloseTo(1.2);
    const down = applyFeedback(empty(), { topic: 'tech', channelId: 'c', rating: -1 });
    expect(down.topic.tech).toBeCloseTo(0.8);
    expect(down.channel.c).toBeCloseTo(0.6);
  });

  it('stays within bounds after many ratings', () => {
    let w = empty();
    for (let i = 0; i < 50; i++) w = applyFeedback(w, { topic: 't', channelId: 'c', rating: 1 });
    expect(w.topic.t).toBe(3);
    expect(w.channel.c).toBe(3);
    for (let i = 0; i < 100; i++) w = applyFeedback(w, { topic: 't', channelId: 'c', rating: -1 });
    expect(w.topic.t).toBe(0.2);
    expect(w.channel.c).toBe(0.1);
  });

  it('does not mutate its input', () => {
    const w = { topic: { t: 1 }, channel: {} };
    applyFeedback(w, { topic: 't', channelId: 'c', rating: 1 });
    expect(w).toEqual({ topic: { t: 1 }, channel: {} });
  });
});

import { describe, it, expect } from 'vitest';
import { parseThoughtIntent, applyThoughtIntent } from '../src/core/thoughts';

const topics = new Set(['1', '6', '11']);

describe('parseThoughtIntent', () => {
  it('keeps known topics and a valid verdict on the item', () => {
    const raw = JSON.stringify({ item: -1, more: ['6', '99'], less: ['11'] });
    expect(parseThoughtIntent(raw, topics)).toEqual({ item: -1, more: ['6'], less: ['11'] });
  });
  it('treats garbage or an unclear thought as no signal', () => {
    expect(parseThoughtIntent('not json', topics)).toEqual({ item: 0, more: [], less: [] });
    expect(parseThoughtIntent(JSON.stringify({ item: 5, more: 'x' }), topics)).toEqual({ item: 0, more: [], less: [] });
  });
  it('never lists a topic as both more and less', () => {
    const raw = JSON.stringify({ item: 0, more: ['6'], less: ['6', '1'] });
    expect(parseThoughtIntent(raw, topics)).toEqual({ item: 0, more: ['6'], less: ['1'] });
  });
});

describe('applyThoughtIntent', () => {
  const w = { topic: { '6': 1, '11': 1 }, channel: { c1: 1 } };
  it('a dislike of the item lowers its creator and topic like a thumbs down', () => {
    const out = applyThoughtIntent(w, { item: -1, more: [], less: [] }, { topic: '11', channelId: 'c1' });
    expect(out.channel.c1).toBeCloseTo(0.6);
    expect(out.topic['11']).toBeCloseTo(0.8);
  });
  it('"more of" and "less of" topics move those topics', () => {
    const out = applyThoughtIntent(w, { item: 0, more: ['6'], less: ['11'] }, null);
    expect(out.topic['6']).toBeGreaterThan(1);
    expect(out.topic['11']).toBeLessThan(1);
    expect(out.channel).toEqual(w.channel);
  });
  it('no signal changes nothing', () => {
    expect(applyThoughtIntent(w, { item: 0, more: [], less: [] }, { topic: '6', channelId: 'c1' })).toEqual(w);
  });
});

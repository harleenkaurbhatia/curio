import { describe, it, expect } from 'vitest';
import { QuotaBudget, QuotaExceeded, COSTS } from '../src/core/quota';

describe('QuotaBudget', () => {
  it('prices list calls at 1 unit from the main bucket', () => {
    expect(COSTS.playlistItems).toBe(1);
    expect(COSTS.videos).toBe(1);
    expect(COSTS.channels).toBe(1);
  });

  it('tracks spend from a starting point', () => {
    const q = new QuotaBudget(500);
    q.spend('playlistItems', 3);
    expect(q.used).toBe(503);
    expect(q.remaining).toBe(10000 - 1000 - 503);
  });

  it('refuses to dip into the reserve', () => {
    const q = new QuotaBudget(8998);
    q.spend('videos', 2);
    expect(q.canSpend('playlistItems')).toBe(false);
    expect(() => q.spend('playlistItems')).toThrow(QuotaExceeded);
    expect(q.used).toBe(9000);
  });

  // Since 2026, search.list has its own bucket: 100 calls/day at 1 unit each.
  it('counts searches in their own 100/day bucket, keeping 10 in reserve', () => {
    const q = new QuotaBudget(0, 89);
    expect(q.canSpend('search')).toBe(true);
    q.spend('search');
    expect(q.searches).toBe(90);
    expect(q.used).toBe(0);
    expect(() => q.spend('search')).toThrow(QuotaExceeded);
  });
});

import { CallLimit, CallLimitReached } from '../src/core/quota';

describe('CallLimit', () => {
  it('allows up to max calls then throws', () => {
    const l = new CallLimit(2);
    l.take(); l.take();
    expect(l.left).toBe(0);
    expect(() => l.take()).toThrow(CallLimitReached);
  });
});

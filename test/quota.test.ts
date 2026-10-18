import { describe, it, expect } from 'vitest';
import { QuotaBudget, QuotaExceeded, COSTS } from '../src/core/quota';

describe('QuotaBudget', () => {
  it('prices search at 100 and list calls at 1', () => {
    expect(COSTS.search).toBe(100);
    expect(COSTS.playlistItems).toBe(1);
    expect(COSTS.videos).toBe(1);
    expect(COSTS.channels).toBe(1);
  });

  it('tracks spend from a starting point', () => {
    const q = new QuotaBudget(500);
    q.spend('search');
    q.spend('playlistItems', 3);
    expect(q.used).toBe(603);
    expect(q.remaining).toBe(10000 - 1000 - 603);
  });

  it('refuses to dip into the reserve', () => {
    const q = new QuotaBudget(8900);
    expect(q.canSpend('search')).toBe(true);
    q.spend('search');
    expect(q.canSpend('playlistItems')).toBe(false);
    expect(() => q.spend('playlistItems')).toThrow(QuotaExceeded);
    expect(q.used).toBe(9000);
  });
});

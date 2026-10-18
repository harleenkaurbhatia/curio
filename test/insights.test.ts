import { describe, it, expect } from 'vitest';
import { computeInsights, type View } from '../src/core/insights';

const DAY = 86_400_000;
const IST = 330; // minutes east of UTC
// 2026-10-18 12:00 IST
const NOW = Date.UTC(2026, 9, 18, 6, 30);
const v = (daysAgo: number, ms: number, topic = 'Science', kind: 'video' | 'post' = 'video'): View =>
  ({ topic, kind, ms, at: NOW - daysAgo * DAY });

describe('computeInsights', () => {
  it('sums today and the last 7 days in the user’s time zone', () => {
    const r = computeInsights([v(0, 60_000), v(0, 30_000, 'Tech', 'post'), v(3, 120_000), v(9, 600_000)], NOW, IST);
    expect(r.today).toEqual({ minutes: 1.5, items: 2 });
    expect(r.week).toMatchObject({ minutes: 3.5, items: 3, videos: 2, reads: 1 });
  });

  it('counts a streak of consecutive active days ending today or yesterday', () => {
    expect(computeInsights([v(0, 1), v(1, 1), v(2, 1), v(4, 1)], NOW, IST).streak).toBe(3);
    expect(computeInsights([v(1, 1), v(2, 1)], NOW, IST).streak).toBe(2); // nothing yet today: streak still alive
    expect(computeInsights([v(2, 1)], NOW, IST).streak).toBe(0);
    expect(computeInsights([], NOW, IST).streak).toBe(0);
  });

  it('marks which of the last 7 days were active (oldest first)', () => {
    expect(computeInsights([v(0, 1), v(6, 1)], NOW, IST).last7).toEqual([true, false, false, false, false, false, true]);
  });

  it('ranks this week’s topics by time spent', () => {
    const r = computeInsights([v(0, 60_000, 'Tech'), v(1, 180_000, 'Science'), v(2, 60_000, 'Tech'), v(8, 999_000, 'Old')], NOW, IST);
    expect(r.topics).toEqual([
      { topic: 'Science', minutes: 3, items: 1 },
      { topic: 'Tech', minutes: 2, items: 2 },
    ]);
  });

  it('uses local midnight, not UTC midnight', () => {
    // 00:30 IST on Oct 18 is still Oct 17 in UTC, but it is "today" for an Indian user.
    const earlyToday = Date.UTC(2026, 9, 17, 19, 0);
    expect(computeInsights([{ topic: 'x', kind: 'video', ms: 60_000, at: earlyToday }], NOW, IST).today.items).toBe(1);
  });
});

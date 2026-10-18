import { describe, it, expect } from 'vitest';
import { parseDuration, isShort } from '../src/core/shorts';

describe('parseDuration', () => {
  it.each([['PT59S', 59], ['PT2M30S', 150], ['PT1H', 3600], ['PT1H2M3S', 3723], ['P0D', 0], ['garbage', 0]])(
    '%s → %d', (iso, s) => expect(parseDuration(iso)).toBe(s));
});

describe('isShort', () => {
  const v = { duration: 'PT3M', embedWidth: 360, embedHeight: 640 };
  it('accepts vertical ≤ 180s', () => expect(isShort(v)).toBe(true));
  it('rejects 181s', () => expect(isShort({ ...v, duration: 'PT3M1S' })).toBe(false));
  it('rejects horizontal', () => expect(isShort({ ...v, embedWidth: 640, embedHeight: 360 })).toBe(false));
  it('rejects unknown dimensions', () => expect(isShort({ duration: 'PT30S' })).toBe(false));
  it('rejects zero-length (live/upcoming)', () => expect(isShort({ ...v, duration: 'P0D' })).toBe(false));
});

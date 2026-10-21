import { describe, it, expect } from 'vitest';
import { parseDuration, isShort, classifyVideo } from '../src/core/shorts';

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

describe('classifyVideo', () => {
  const wide = { duration: 'PT8M', embedWidth: 640, embedHeight: 360 };
  it('keeps a Short as vertical', () => expect(classifyVideo({ duration: 'PT40S', embedWidth: 360, embedHeight: 640 }, false)).toBe('short'));
  it('drops long videos unless the topic allows them', () => expect(classifyVideo(wide, false)).toBeNull());
  it('keeps a 2–20 min video when allowed', () => expect(classifyVideo(wide, true)).toBe('long'));
  it('drops very long videos even when allowed', () => expect(classifyVideo({ ...wide, duration: 'PT20M1S' }, true)).toBeNull());
  it('drops clips under 2 min that are not Shorts', () => expect(classifyVideo({ ...wide, duration: 'PT90S' }, true)).toBeNull());
});

import { fullVideoId } from '../src/core/shorts';
describe('fullVideoId', () => {
  it('finds a linked full video', () => {
    expect(fullVideoId('Full video: https://youtu.be/dQw4w9WgXcQ #shorts', 'abcdefghijk')).toBe('dQw4w9WgXcQ');
    expect(fullVideoId('watch https://www.youtube.com/watch?si=x&v=dQw4w9WgXcQ', 'abcdefghijk')).toBe('dQw4w9WgXcQ');
  });
  it('ignores shorts links, itself and empty text', () => {
    expect(fullVideoId('https://youtube.com/shorts/dQw4w9WgXcQ', 'x')).toBeNull();
    expect(fullVideoId('https://youtu.be/abcdefghijk', 'abcdefghijk')).toBeNull();
    expect(fullVideoId(undefined, 'x')).toBeNull();
  });
});

import { likeRatio } from '../src/core/shorts';
describe('likeRatio', () => {
  it('is likes per view', () => expect(likeRatio(10_000, 400)).toBeCloseTo(0.04));
  it('is unknown with too few views or hidden likes', () => {
    expect(likeRatio(50, 10)).toBeNull();
    expect(likeRatio(10_000, undefined)).toBeNull();
  });
});

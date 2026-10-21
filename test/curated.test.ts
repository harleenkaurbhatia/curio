import { describe, it, expect } from 'vitest';
import { curatedScore } from '../src/core/channelScores';

describe('curatedScore (hand-picked creators get no free pass, but no hard cut either)', () => {
  it('keeps Claude’s score', () => {
    expect(curatedScore({ id: 'a', score: 0.82, language: 'en', accept: true, reason: '' })).toBe(0.82);
    expect(curatedScore({ id: 'a', score: 0.45, language: 'en', accept: false, reason: 'thin' })).toBe(0.45);
  });
  it('a hard reject sinks the creator to 0.3 at most instead of removing them', () => {
    expect(curatedScore({ id: 'a', score: 0.6, language: 'en', accept: false, reason: 'clickbait: hype titles' })).toBe(0.3);
  });
});

import { describe, it, expect } from 'vitest';
import { parseScores, ACCEPT_AT } from '../src/core/channelScores';

describe('parseScores', () => {
  const ids = ['a', 'b', 'c'];
  it('keeps valid rows and decides acceptance from the score and reject flag', () => {
    const raw = JSON.stringify({ channels: [
      { id: 'a', score: 0.85, language: 'hi', reject_reason: null, summary: 'clear explainers' },
      { id: 'b', score: 0.9, language: 'en', reject_reason: 'lifestyle_flex', summary: 'luxury vlogs' },
      { id: 'c', score: ACCEPT_AT - 0.01, language: 'en', reject_reason: null, summary: 'meh' },
    ] });
    expect(parseScores(raw, ids)).toEqual([
      { id: 'a', score: 0.85, language: 'hi', accept: true, reason: 'clear explainers' },
      { id: 'b', score: 0.9, language: 'en', accept: false, reason: 'lifestyle_flex: luxury vlogs' },
      { id: 'c', score: ACCEPT_AT - 0.01, language: 'en', accept: false, reason: 'meh' },
    ]);
  });

  it('skips malformed, unknown or out-of-range rows so they are retried later', () => {
    const raw = JSON.stringify({ channels: [
      { id: 'zzz', score: 0.9, language: 'en', reject_reason: null, summary: 'not asked' },
      { id: 'a', score: 'high', language: 'en', reject_reason: null, summary: 'x' },
      { id: 'b', score: 1.7, language: 'en', reject_reason: null, summary: 'x' },
      { id: 'c', score: 0.7, language: 'en', reject_reason: null, summary: 'ok' },
    ] });
    expect(parseScores(raw, ids).map((s) => s.id)).toEqual(['c']);
  });

  it('returns [] for non-JSON output', () => {
    expect(parseScores('sorry, I cannot', ids)).toEqual([]);
  });
});

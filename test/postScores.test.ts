import { describe, it, expect } from 'vitest';
import { parsePostScores, POST_ACCEPT_AT } from '../src/core/postScores';

describe('parsePostScores', () => {
  it('accepts good posts, rejects flagged or weak ones, keeps the hook', () => {
    const raw = JSON.stringify({ posts: [
      { id: 'a', score: 0.8, reject_reason: null, hook: 'Why octopuses might dream' },
      { id: 'b', score: 0.9, reject_reason: 'rage_bait', hook: 'x' },
      { id: 'c', score: POST_ACCEPT_AT - 0.05, reject_reason: null, hook: 'meh' },
    ] });
    expect(parsePostScores(raw, ['a', 'b', 'c'])).toEqual([
      { id: 'a', score: 0.8, accept: true, hook: 'Why octopuses might dream' },
      { id: 'b', score: 0.9, accept: false, hook: 'x' },
      { id: 'c', score: POST_ACCEPT_AT - 0.05, accept: false, hook: 'meh' },
    ]);
  });
  it('drops unknown ids, bad scores and non-JSON', () => {
    expect(parsePostScores(JSON.stringify({ posts: [{ id: 'z', score: 0.9, reject_reason: null, hook: '' }, { id: 'a', score: -1, reject_reason: null, hook: '' }] }), ['a'])).toEqual([]);
    expect(parsePostScores('nope', ['a'])).toEqual([]);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { YouTube, SearchUnavailable } from '../src/youtube';
import { QuotaBudget, CallLimit } from '../src/core/quota';

afterEach(() => vi.unstubAllGlobals());
const yt = () => new YouTube('k', new QuotaBudget(), new CallLimit(10));

describe('YouTube search errors', () => {
  it('a 429 from search is SearchUnavailable, so discovery can be skipped without stopping the run', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":{"code":429}}', { status: 429 }));
    await expect(yt().searchShorts('q', 'en', 7)).rejects.toBeInstanceOf(SearchUnavailable);
  });
  it('other endpoints still throw a plain error', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 429 }));
    const err = await yt().latestUploads('UU1').catch((e) => e);
    expect(err).not.toBeInstanceOf(SearchUnavailable);
  });
});

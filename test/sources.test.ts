import { describe, it, expect } from 'vitest';
import { parseFeed, postsFromAuthorFeed, postsFromHN, cleanText } from '../src/core/sources';

describe('cleanText', () => {
  it('strips tags, decodes entities, collapses whitespace, caps length', () => {
    expect(cleanText('<p>Tom &amp; Jerry&#8217;s <b>big</b>\n\n day&nbsp;out &#x27;</p>')).toBe("Tom & Jerry’s big day out '");
    expect(cleanText('a'.repeat(700)).length).toBeLessThanOrEqual(600);
  });
});

describe('parseFeed', () => {
  it('reads RSS 2.0 with CDATA and skips undated items', () => {
    const xml = `<rss><channel><title>Quanta</title>
      <item><title><![CDATA[Why <i>black holes</i> spin]]></title><link>https://q.org/a</link>
        <guid>https://q.org/a</guid><pubDate>Sat, 17 Oct 2026 10:00:00 +0000</pubDate>
        <description><![CDATA[<p>Physicists &amp; friends found&#8230;</p>]]></description>
        <media:content url="https://q.org/a.jpg" medium="image"/></item>
      <item><title>No date</title><link>https://q.org/b</link></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Why black holes spin', text: 'Physicists & friends found…', url: 'https://q.org/a',
      publishedAt: Date.parse('2026-10-17T10:00:00Z'), image: 'https://q.org/a.jpg',
    });
    expect(items[0].id).toBe('https://q.org/a');
  });

  it('reads Atom', () => {
    const xml = `<feed><entry><title type="html">Hello &amp;lt;world&amp;gt;</title><link rel="alternate" href="https://x.dev/p"/>
      <id>tag:x,1</id><updated>2026-10-16T08:00:00Z</updated><summary>Short &amp; sweet</summary></entry></feed>`;
    expect(parseFeed(xml)[0]).toMatchObject({ id: 'tag:x,1', title: 'Hello <world>', url: 'https://x.dev/p', text: 'Short & sweet' });
  });

  it('returns [] for junk', () => expect(parseFeed('<html>nope</html>')).toEqual([]));
});

describe('postsFromAuthorFeed (Bluesky)', () => {
  const base = (over: any = {}) => ({
    post: {
      uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz', author: { handle: 'sci.bsky.social', displayName: 'Sci', avatar: 'https://a/av.jpg' },
      record: { text: 'New paper: octopuses dream.', createdAt: '2026-10-17T09:00:00Z' },
      embed: { $type: 'app.bsky.embed.external#view', external: { uri: 'https://nature.com/x', title: 'Octopus sleep', thumb: 'https://a/t.jpg' } },
      ...over,
    },
  });
  it('maps posts with link cards to public bsky.app URLs', () => {
    const [p] = postsFromAuthorFeed({ feed: [base()] });
    expect(p).toMatchObject({
      id: 'bsky:at://did:plc:abc/app.bsky.feed.post/3kxyz', url: 'https://bsky.app/profile/sci.bsky.social/post/3kxyz',
      text: 'New paper: octopuses dream.', title: 'Octopus sleep', image: 'https://a/t.jpg', author: 'Sci',
      publishedAt: Date.parse('2026-10-17T09:00:00Z'),
    });
  });
  it('skips replies, reposts and very short posts', () => {
    const reply = base({ record: { text: 'agreed, and also this is long enough', createdAt: '2026-10-17T09:00:00Z', reply: { parent: {} } } });
    const short = base({ record: { text: 'lol', createdAt: '2026-10-17T09:00:00Z' }, embed: undefined });
    const repost = { ...base(), reason: { $type: 'app.bsky.feed.defs#reasonRepost' } };
    expect(postsFromAuthorFeed({ feed: [reply, short, repost] })).toEqual([]);
  });
});

describe('postsFromHN', () => {
  it('maps front-page stories with enough points, falling back to the HN item page', () => {
    const out = postsFromHN({ hits: [
      { objectID: '1', title: 'Show HN: X', url: 'https://x.com', points: 300, created_at_i: 1760000000, author: 'pg' },
      { objectID: '2', title: 'Ask HN: Y?', url: null, points: 200, created_at_i: 1760000000, author: 'a', story_text: '<p>Body</p>' },
      { objectID: '3', title: 'Meh', url: 'https://m.com', points: 40, created_at_i: 1760000000, author: 'b' },
    ] });
    expect(out.map((p) => p.url)).toEqual(['https://x.com', 'https://news.ycombinator.com/item?id=2']);
    expect(out[1].text).toBe('Body');
    expect(out[0].id).toBe('hn:1');
  });
});

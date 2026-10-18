// Pure parsers for text "reads": RSS/Atom, Bluesky author feeds, Hacker News (Algolia).
export type RawPost = { id: string; title: string; text: string; url: string; publishedAt: number; image?: string; author?: string };

const MAX_TEXT = 600;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function cleanText(html: string, max = MAX_TEXT): string {
  const text = decodeEntities(decodeEntities(html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1') : '';
};
const attr = (xml: string, name: string, a: string) => {
  const m = new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]+)"`, 'i').exec(xml);
  return m ? decodeEntities(m[1]) : '';
};

export function parseFeed(xml: string): RawPost[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const out: RawPost[] = [];
  for (const b of blocks) {
    const atom = /^<entry/i.test(b);
    const url = atom
      ? attr(b.replace(/<link\b(?![^>]*rel="alternate")(?=[^>]*rel=)[^>]*>/gi, ''), 'link', 'href')
      : cleanText(tag(b, 'link'), 2000);
    const date = Date.parse(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    if (!url || !Number.isFinite(date)) continue;
    const image = attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') || attr(b, 'enclosure', 'url') || undefined;
    out.push({
      id: cleanText(tag(b, atom ? 'id' : 'guid'), 500) || url,
      title: cleanText(tag(b, 'title'), 200),
      text: cleanText(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')),
      url,
      publishedAt: date,
      image,
      author: cleanText(tag(b, 'dc:creator') || tag(tag(b, 'author'), 'name') || tag(b, 'author'), 80) || undefined,
    });
  }
  return out;
}

// Bluesky app.bsky.feed.getAuthorFeed → original, substantive posts only.
export function postsFromAuthorFeed(data: { feed?: any[] }): RawPost[] {
  const out: RawPost[] = [];
  for (const item of data.feed ?? []) {
    const p = item.post;
    if (!p || item.reason || p.record?.reply) continue;
    const text = cleanText(p.record?.text ?? '');
    const ext = p.embed?.$type?.startsWith('app.bsky.embed.external') ? p.embed.external : undefined;
    const img = p.embed?.images?.[0]?.thumb;
    if (text.length < 40 && !ext) continue;
    const rkey = String(p.uri).split('/').pop();
    const date = Date.parse(p.record?.createdAt);
    if (!Number.isFinite(date)) continue;
    out.push({
      id: `bsky:${p.uri}`,
      title: ext?.title ? cleanText(ext.title, 200) : '',
      text,
      url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
      publishedAt: date,
      image: ext?.thumb ?? img,
      author: p.author.displayName || p.author.handle,
    });
  }
  return out;
}

export const HN_MIN_POINTS = 150;

export function postsFromHN(data: { hits?: any[] }): RawPost[] {
  return (data.hits ?? [])
    .filter((h) => (h.points ?? 0) >= HN_MIN_POINTS && h.title)
    .map((h) => ({
      id: `hn:${h.objectID}`,
      title: cleanText(h.title, 200),
      text: cleanText(h.story_text ?? ''),
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      publishedAt: h.created_at_i * 1000,
      author: h.author,
    }));
}

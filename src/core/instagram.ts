// Instagram DMs → Curio inbox. Meta posts every DM to our webhook (Instagram API with
// Instagram Login, `messages` field). We keep only reels and posts people share with you.

export type InboxItem = {
  id: string; ownerIgId: string; senderIgId: string; kind: 'reel' | 'post';
  mediaUrl: string | null; title: string | null; mediaId: string | null; link: string | null; text: string | null; at: number;
};

const KIND: Record<string, InboxItem['kind']> = { ig_reel: 'reel', reel: 'reel', ig_post: 'post', share: 'post' };

const LINK_RE = /https?:\/\/(?:www\.)?instagram\.com\/(reels?|p)\/([A-Za-z0-9_-]+)/g;

export function reelLinksIn(text: string): { kind: InboxItem['kind']; link: string }[] {
  return [...text.matchAll(LINK_RE)].map((m) => m[1] === 'p'
    ? { kind: 'post' as const, link: `https://www.instagram.com/p/${m[2]}/` }
    : { kind: 'reel' as const, link: `https://www.instagram.com/reel/${m[2]}/` });
}

export function parseWebhook(body: any): InboxItem[] {
  const out: InboxItem[] = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const ev of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      const m = ev?.message;
      if (!m?.mid || m.is_echo || !ev.sender?.id) continue; // echo = something I sent
      const base = { ownerIgId: String(entry.id ?? ev.recipient?.id ?? ''), senderIgId: String(ev.sender.id), at: Number(ev.timestamp) || Date.now() };
      const text: string | null = typeof m.text === 'string' && m.text.trim() ? m.text : null;
      let n = 0;
      for (const a of Array.isArray(m.attachments) ? m.attachments : []) {
        const kind = KIND[a?.type];
        if (!kind) continue;
        const p = a.payload ?? {};
        out.push({
          ...base, id: `${m.mid}:${n++}`, kind, mediaUrl: p.url ?? null, title: p.title ?? null,
          mediaId: p.reel_video_id ?? p.ig_post_media_id ?? null, link: null, text,
        });
      }
      if (text) for (const l of reelLinksIn(text)) {
        out.push({ ...base, id: `${m.mid}:${n++}`, kind: l.kind, mediaUrl: null, title: null, mediaId: null, link: l.link, text });
      }
    }
  }
  return out;
}

// Instagram URL shortcodes are the numeric media id written in a base64 alphabet.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function mediaIdToShortcode(id: string): string | null {
  if (!/^\d+$/.test(id)) return null;
  let n = BigInt(id), s = '';
  do { s = ALPHABET[Number(n % 64n)] + s; n /= 64n; } while (n > 0n);
  return s;
}

// Meta signs each webhook body with the app secret (X-Hub-Signature-256).
export async function verifySignature(raw: string, header: string | null | undefined, secret: string): Promise<boolean> {
  if (!header?.startsWith('sha256=') || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const want = header.slice(7);
  const got = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

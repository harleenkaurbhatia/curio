import { describe, it, expect } from 'vitest';
import { parseWebhook, verifySignature, mediaIdToShortcode, reelLinksIn } from '../src/core/instagram';

const ME = '17841400000000001';
const body = (messaging: unknown[]) => ({ object: 'instagram', entry: [{ id: ME, time: 1, messaging }] });
const msg = (message: object, sender = '9001') => ({ sender: { id: sender }, recipient: { id: ME }, timestamp: 1760000000000, message: { mid: 'm1', ...message } });

describe('parseWebhook', () => {
  it('turns a shared reel into an inbox item with the sender', () => {
    const items = parseWebhook(body([msg({ attachments: [{ type: 'ig_reel', payload: { url: 'https://cdn/x.mp4', title: 'How bridges work', reel_video_id: '3120000000000000000' } }] })]));
    expect(items).toEqual([{
      id: 'm1:0', ownerIgId: ME, senderIgId: '9001', kind: 'reel', mediaUrl: 'https://cdn/x.mp4', title: 'How bridges work',
      mediaId: '3120000000000000000', link: null, text: null, at: 1760000000000,
    }]);
  });

  it('handles shared posts (ig_post and legacy share)', () => {
    const items = parseWebhook(body([msg({ attachments: [{ type: 'ig_post', payload: { url: 'https://cdn/p.jpg', title: 'A post', ig_post_media_id: '42' } }, { type: 'share', payload: { url: 'https://cdn/s.jpg' } }] })]));
    expect(items.map((i) => [i.kind, i.mediaId])).toEqual([['post', '42'], ['post', null]]);
  });

  it('picks up reel links pasted as text, keeping the message', () => {
    const items = parseWebhook(body([msg({ text: 'watch this https://www.instagram.com/reel/DAbc123xyz/?igsh=1 lol' })]));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'reel', link: 'https://www.instagram.com/reel/DAbc123xyz/', text: 'watch this https://www.instagram.com/reel/DAbc123xyz/?igsh=1 lol' });
  });

  it('ignores my own sent messages, plain chat, reads and reactions', () => {
    expect(parseWebhook(body([
      msg({ is_echo: true, attachments: [{ type: 'ig_reel', payload: { url: 'u' } }] }),
      msg({ text: 'hi!' }),
      { sender: { id: '9001' }, recipient: { id: ME }, timestamp: 1, read: { mid: 'm0' } },
    ]))).toEqual([]);
  });

  it('survives junk', () => {
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook({ entry: [{}] })).toEqual([]);
  });
});

describe('reelLinksIn', () => {
  it('normalises reel and post links', () => {
    expect(reelLinksIn('a https://instagram.com/reels/AbC_-1/ b https://www.instagram.com/p/XyZ9?x=1')).toEqual([
      { kind: 'reel', link: 'https://www.instagram.com/reel/AbC_-1/' }, { kind: 'post', link: 'https://www.instagram.com/p/XyZ9/' }]);
  });
});

describe('mediaIdToShortcode', () => {
  it('converts a numeric media id to the URL shortcode', () => {
    expect(mediaIdToShortcode('1')).toBe('B');
    expect(mediaIdToShortcode('64')).toBe('BA');
    expect(mediaIdToShortcode('not a number')).toBeNull();
  });
});

describe('verifySignature', () => {
  it('accepts the right HMAC and rejects a wrong one', async () => {
    const raw = '{"a":1}';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(await verifySignature(raw, `sha256=${sig}`, 'secret')).toBe(true);
    expect(await verifySignature(raw, `sha256=${sig}`, 'other')).toBe(false);
    expect(await verifySignature(raw, null, 'secret')).toBe(false);
  });
});

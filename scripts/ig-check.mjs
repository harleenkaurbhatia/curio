// End-to-end check of the Instagram inbox with a simulated, signed Meta webhook (local dev only).
import { chromium, devices } from 'playwright';
import { execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
const BASE = process.env.BASE ?? 'http://localhost:8787';
const SECRET = 'local-test-secret', IG = '17841400000000001';
const sql = (q) => execSync(`./node_modules/.bin/wrangler d1 execute curio --local --command "${q}"`, { stdio: 'pipe' });
let failed = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failed++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE);
await page.waitForSelector('#onboarding:not([hidden]) #ob-topic-chips button');
await page.locator('#ob-topic-chips button').first().click();
await page.click('#ob-next'); await page.waitForSelector('#ob-langs:not([hidden])'); await page.click('#ob-next');
await page.waitForSelector('#app:not([hidden])');

// Link this guest to a fake Instagram account, with a known sender.
sql(`DELETE FROM ig_accounts WHERE ig_id='${IG}'; INSERT INTO ig_accounts (ig_id, user_id, username, token, token_refreshed_at) SELECT '${IG}', MAX(id), 'harleen.test', 'fake-token', ${Date.now()} FROM users; INSERT OR REPLACE INTO ig_senders (ig_id, name, username, pic, fetched_at) VALUES ('9001', 'Priya Sharma', 'priya.s', NULL, ${Date.now()});`);

const verify = await fetch(`${BASE}/api/ig/webhook?hub.mode=subscribe&hub.verify_token=local-verify&hub.challenge=abc123`);
check((await verify.text()) === 'abc123', 'webhook verification echoes the challenge');
const send = async (body, secret = SECRET) => {
  const raw = JSON.stringify(body);
  return fetch(`${BASE}/api/ig/webhook`, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}` } });
};
const mid = `m-${Date.now()}`;
const dm = { object: 'instagram', entry: [{ id: IG, time: 1, messaging: [
  { sender: { id: '9001' }, recipient: { id: IG }, timestamp: Date.now(), message: { mid, attachments: [{ type: 'ig_reel', payload: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', title: 'Why flowers open at sunrise', reel_video_id: '3120000000000000000' } }] } },
  { sender: { id: '9001' }, recipient: { id: IG }, timestamp: Date.now(), message: { mid: `${mid}-e`, is_echo: true, text: 'my own reply https://www.instagram.com/reel/XYZ/' } },
] }] };
check((await send(dm, 'wrong-secret')).status === 403, 'webhook with a bad signature is rejected');
check((await send(dm)).status === 200, 'signed webhook accepted');
check((await send(dm)).status === 200, 'duplicate delivery is harmless');

await page.waitForFunction(() => !document.querySelector('#inbox-badge').hidden, null, { timeout: 70_000 }).catch(() => {});
await page.reload(); await page.waitForSelector('#app:not([hidden])');
await page.waitForFunction(() => !document.querySelector('#inbox-badge').hidden);
check((await page.textContent('#inbox-badge')) === '1', 'badge shows 1 unread (echo of my own message ignored, duplicate ignored)');
await page.click('#inbox-btn');
await page.waitForSelector('#inbox .dm');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screenshots/14-inbox.png' });
check((await page.textContent('#inbox .sent-by')).includes('Sent by Priya Sharma'), 'shows who sent it');
check((await page.textContent('#inbox .sent-by')).includes('@priya.s'), 'shows their @username');
check(await page.isVisible('#inbox .dm video'), 'reel plays full screen');
await page.click('#inbox-back');
await page.waitForFunction(() => document.querySelector('#inbox-badge').hidden);
check(true, 'viewing marks it seen and clears the badge');
check(errors.length === 0, `no page errors ${errors.join('; ')}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;

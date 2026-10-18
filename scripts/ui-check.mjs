// Phone-width end-to-end check against a running dev server with demo data.
// Usage: node scripts/ui-check.mjs [outDir]
import { chromium, devices } from 'playwright';

const out = process.argv[2] ?? 'screenshots';
const BASE = process.env.BASE ?? 'http://localhost:8787';
const email = `test+${Date.now()}@curio.app`;
const password = 'curio-test-123';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
let failed = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failed++; };
const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// --- Sign up ---
await page.goto(BASE);
await page.waitForSelector('#auth:not([hidden])');
await shot('01-signin');
await page.click('#auth-switch');
await page.fill('#auth-name', 'Test User');
await page.fill('#auth-email', email);
await page.fill('#auth-password', 'short');
await page.click('#auth-submit');
await page.waitForFunction(() => document.querySelector('#auth-error').textContent.length > 0);
check((await page.textContent('#auth-error')).includes('8 characters'), 'weak password is rejected with a clear message');
await page.fill('#auth-password', password);
await page.click('#auth-submit');

// --- Onboarding ---
await page.waitForSelector('#onboarding:not([hidden]) #ob-topic-chips button');
await shot('02-onboarding-topics');
check(await noHScroll(), 'onboarding: no horizontal scroll');
await page.click('#ob-next');
await page.waitForSelector('#ob-langs:not([hidden])');
await shot('03-onboarding-langs');
await page.click('#ob-next');

// --- Feed ---
await page.waitForSelector('#app:not([hidden]) .slide:not(.end)');
await page.waitForTimeout(2500);
await shot('04-feed');
check(await noHScroll(), 'feed: no horizontal scroll at 390px');
const kinds = await page.$$eval('#feed .slide:not(.end)', (s) => s.map((x) => (x.classList.contains('read') ? 'post' : 'video')));
check(kinds.includes('post') && kinds.includes('video'), `feed mixes videos and reads (${kinds.join(',')})`);
check(kinds.every((k, i) => i === 0 || !(k === 'post' && kinds[i - 1] === 'post')), 'no two reads back to back');

const readIdx = kinds.indexOf('post');
const scrollTo = (i) => page.evaluate((i) => { const f = document.querySelector('#feed'); f.scrollTo({ top: i * f.clientHeight }); }, i);
await scrollTo(readIdx);
await page.waitForTimeout(1200);
await shot('05-read-card');
const slide = page.locator('#feed .slide').nth(readIdx);

await slide.locator('.act.save').click();
await page.waitForFunction((i) => document.querySelectorAll('#feed .slide')[i].querySelector('.act.save').getAttribute('aria-pressed') === 'true', readIdx);
check(true, '🔖 save marks the item');
await slide.locator('.act.later').click();
await page.waitForFunction((i) => document.querySelectorAll('#feed .slide')[i].querySelector('.act.later').getAttribute('aria-pressed') === 'true', readIdx);
check(true, '🕒 later marks the item');

await slide.locator('.act.share').click();
await page.waitForSelector('#share-sheet:not([hidden])');
const wa = await page.getAttribute('#share-wa', 'href');
check(wa.startsWith('https://wa.me/?text=') && !wa.includes('localhost'), 'share falls back to WhatsApp/Telegram/X/copy with the original link');
await shot('06-share');
await page.click('#scrim');

await slide.locator('.act.think').click();
await page.waitForSelector('#thought-sheet:not([hidden])');
await page.fill('#thought-text', 'What would this mean for India?');
await shot('07-thought');
await page.click('#thought-save');
await page.waitForSelector('#thought-sheet', { state: 'hidden' });
check(true, '💭 thought saves');

await slide.locator('.act.up').click();
check(await slide.locator('.act.up').getAttribute('aria-pressed') === 'true', '👍 marks as pressed');
const vIdx = kinds.indexOf('video', readIdx + 1);
await scrollTo(vIdx);
await page.waitForTimeout(1000);
const before = await page.evaluate(() => document.querySelector('#feed').scrollTop);
await page.locator('#feed .slide').nth(vIdx).locator('.act.down').click();
await page.waitForTimeout(1500);
check(await page.evaluate(() => document.querySelector('#feed').scrollTop) > before, '👎 skips to the next item');

// --- Done for now ---
await page.click('#done-btn');
await page.waitForSelector('#summary:not([hidden])');
await shot('08-summary');
const savedStat = await page.$$eval('#summary-stats .tile', (t) => t.map((x) => x.textContent));
check(savedStat.some((s) => s.includes('1saved')) && savedStat.some((s) => s.includes('1thoughts')), `session summary counts saves and thoughts (${savedStat.join(' | ')})`);
await page.click('#summary-close');

// --- Library ---
await page.waitForSelector('#view-library:not([hidden]) .lib-item');
await shot('09-library-saved');
check(await page.locator('#library-list .lib-item').count() === 1, 'library shows the saved item');
await page.click('[data-lib=later]');
await page.waitForSelector('#library-list .lib-item');
check(true, 'later list shows the item');
await page.click('[data-lib=thoughts]');
await page.waitForSelector('#library-list .thought');
check((await page.textContent('#library-list .thought p')) === 'What would this mean for India?', 'thought appears with its text');
await shot('10-library-thoughts');
await page.locator('#library-list .thought .ref').click();
await page.waitForSelector('#viewer-sheet:not([hidden])');
await shot('11-viewer');
await page.click('.close-sheet');

// --- Insights ---
await page.click('#tabbar [data-view=insights]');
await page.waitForSelector('#insights .tile');
await shot('12-insights');
const streak = await page.textContent('#insights .tiles .tile:nth-child(3) .value');
check(streak === '1', `insights shows a 1-day streak (got ${streak})`);
check(await page.locator('#insights .bar-row').count() >= 1, 'insights lists topics explored');
check(await noHScroll(), 'insights: no horizontal scroll');

// --- Profile ---
await page.click('#tabbar [data-view=profile]');
await page.waitForSelector('#topic-list li');
await shot('13-profile');
await page.fill('#topic-name', `Space ${Date.now() % 1000}`);
await page.click('#add-topic button');
await page.waitForFunction(() => document.querySelector('.toast, #toast')?.textContent.includes('Topic added'));
check(true, 'adding a custom topic works');
const nCreators = await page.locator('#creator-list li').count();
if (nCreators) {
  await page.locator('#creator-list .small-btn').first().click();
  await page.waitForFunction((n) => document.querySelectorAll('#creator-list li').length === n - 1, nCreators);
  check(true, 'hiding a creator works');
}
check(await noHScroll(), 'profile: no horizontal scroll');

// --- Sign out / in / delete ---
await page.click('#logout');
await page.waitForSelector('#auth:not([hidden])');
await page.fill('#auth-email', email);
await page.fill('#auth-password', 'wrong-password');
await page.click('#auth-submit');
await page.waitForFunction(() => document.querySelector('#auth-error').textContent.length > 0);
check(true, 'wrong password is rejected');
await page.fill('#auth-password', password);
await page.click('#auth-submit');
await page.waitForSelector('#app:not([hidden])');
check(true, 'sign out and back in works (no onboarding again)');
await page.click('#tabbar [data-view=library]');
await page.waitForSelector('#library-list .lib-item');
check(true, 'library persists across sign-in');

await page.click('#tabbar [data-view=profile]');
page.once('dialog', (d) => d.accept(password));
await page.click('#delete-account');
await page.waitForSelector('#auth:not([hidden])');
await page.fill('#auth-email', email);
await page.fill('#auth-password', password);
await page.click('#auth-submit');
await page.waitForFunction(() => document.querySelector('#auth-error').textContent.length > 0);
check(true, 'deleted account can no longer sign in');

check(errors.length === 0, `no page errors ${errors.join('; ')}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;

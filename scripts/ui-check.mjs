// Phone-width UI check against a running dev server. Usage: node scripts/ui-check.mjs [outDir]
import { chromium, devices } from 'playwright';
const out = process.argv[2] ?? 'screenshots';
const BASE = process.env.BASE ?? 'http://localhost:8787';
const browser = await chromium.launch();
const page = await browser.newPage({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) process.exitCode = 1; };

await page.goto(BASE);
await page.waitForSelector('#login:not([hidden])');
await shot('1-login');
await page.fill('#passcode', '0000');
await page.click('#login-form button');
await page.waitForFunction(() => document.querySelector('#login-error').textContent.length > 0);
check(await page.textContent('#login-error') === 'Wrong passcode', 'wrong passcode shows an error');

await page.fill('#passcode', '2468');
await page.click('#login-form button');
await page.waitForSelector('.slide:not(.end)');
await page.waitForTimeout(2500);
await shot('2-feed');
const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check(!hScroll, 'no horizontal scroll at 390px');

const titles = async () => page.$$eval('.slide:not(.end)', (s) => s.map((x) => x.querySelector('.by').textContent.split(' · ')[0]));
const chans = await titles();
check(chans.every((c, i) => i === 0 || c !== chans[i - 1]), `no creator back to back (${chans.length} slides)`);

// Swipe = scroll one screen.
const scrollTo = (i) => page.evaluate((i) => document.querySelector('#feed').scrollTo({ top: i * window.innerHeight }), i);
await scrollTo(1);
await page.waitForTimeout(1200);
await shot('3-second');

// 👎 should mark pressed and move on.
const before = await page.evaluate(() => document.querySelector('#feed').scrollTop);
await page.locator('.slide').nth(1).locator('.rate.down').click();
await page.waitForTimeout(1500);
const after = await page.evaluate(() => document.querySelector('#feed').scrollTop);
check(await page.locator('.slide').nth(1).locator('.rate.down').getAttribute('aria-pressed') === 'true', '👎 marks as pressed');
check(after > before, '👎 skips to the next video');
await page.locator('.slide').nth(2).locator('.rate.up').click();
check(await page.locator('.slide').nth(2).locator('.rate.up').getAttribute('aria-pressed') === 'true', '👍 marks as pressed');

// Scroll to the end until caught up.
for (let i = 0; i < 40 && !(await page.$('#end-slide')); i++) {
  const n = await page.locator('.slide').count();
  await scrollTo(n - 1);
  await page.waitForTimeout(700);
}
await page.locator('#end-slide').scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await shot('4-caught-up');
check(!!(await page.$('#end-slide')), 'caught-up screen appears when supply runs out');
const all = await page.$$eval('.slide:not(.end)', (s) => s.map((x) => x.dataset.index));
check(new Set(all).size === all.length, `no duplicate videos (${all.length} total)`);

// Topics & creators.
await page.click('#open-menu');
await page.waitForSelector('#topic-list li');
await shot('5-topics');
check((await page.locator('#topic-list li').count()) === 11, '11 starting topics listed');
await page.fill('#topic-name', 'Space');
await page.click('#add-topic button');
await page.waitForFunction(() => document.querySelectorAll('#topic-list li').length === 12);
check(true, 'adding a topic works');
await page.click('[data-tab=creators]');
await page.waitForSelector('#creator-list li');
await shot('6-creators');
page.once('dialog', (d) => d.accept());
const nBefore = await page.locator('#creator-list li').count();
await page.locator('#creator-list .remove').first().click();
await page.waitForFunction((n) => document.querySelectorAll('#creator-list li').length === n - 1, nBefore);
check(true, 'removing a creator works');

check(errors.length === 0, `no page errors ${errors.join('; ')}`);
await browser.close();

# Curio

A private, Reels-style feed of **knowledge-only** YouTube Shorts, just for you. No stories, no followers, no like counts. Curio finds good creators for your topics, vets them with Claude, and serves a fresh, varied feed that learns from your 👍/👎.

- **Runs on:** Cloudflare Workers (free plan): the app, the API, a SQLite database (D1) and a background job every 15 minutes.
- **Costs:** YouTube API free; Claude Haiku 5.5 about $0.50–1/month.
- **Plays videos only** through the official YouTube player (privacy-enhanced `youtube-nocookie.com`). Nothing is downloaded or re-hosted.

## 1. Get your keys (one time, ~15 minutes)

| Key | Where | Notes |
|---|---|---|
| `YOUTUBE_API_KEY` | [console.cloud.google.com](https://console.cloud.google.com) → new project → *APIs & Services* → *Library* → enable **YouTube Data API v3** → *Credentials* → *Create credentials* → **API key** | Free. Restrict the key to "YouTube Data API v3". |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → *Settings* → *API keys* | Add ~$5 of credit under *Billing*; it lasts months. |
| `APP_PASSCODE` | You choose | What you type to unlock the app. |
| `SESSION_SECRET` | Run `openssl rand -hex 32` | Signs your login cookie. |

You'll also need a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

## 2. Run it on your computer

```bash
npm install
cp .dev.vars.example .dev.vars   # then fill in your keys
npm run db:local                 # create the local database
npm run dev                      # http://localhost:8787
```

Without API keys you can still try the app with demo videos: `npm run db:demo`.

To fill it with real creators right away instead of waiting for the background job, unlock the app in a browser, then run this in the browser console a few times (each run does a small slice of work):

```js
await (await fetch('/api/admin/refresh', { method: 'POST' })).json()
```

## 3. Deploy

```bash
npx wrangler login
npx wrangler d1 create curio          # copy the database_id it prints into wrangler.toml
npm run db:remote                     # create tables + starting topics
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put APP_PASSCODE
npx wrangler secret put SESSION_SECRET
npm run deploy                        # prints your https://curio.<you>.workers.dev URL
```

The first creators show up within an hour as the background job works through your topics. The first day uses roughly 2,500 of YouTube's 10,000 daily units; after that, about 1,000 a day.

## 4. Install on Android

Open your Curio URL in **Chrome** → unlock → menu ⋮ → **Add to Home screen** → **Install**.

## How it works

1. **Discover** (at most once a day per topic, only for topics with fewer than 12 creators): one YouTube search in English and one in Hindi for Shorts from the last week or month. Channels that come up repeatedly go first.
2. **Vet**: Claude Haiku 5.5 reads each channel's recent titles and scores it for consistency, clarity and credibility. It rejects clickbait, rage-bait, reposts, low credibility and lifestyle/flex content. Channels need a score of 0.6+ and an upload in the last 30 days.
3. **Fetch**: every creator is rechecked about every 4 hours through their uploads playlist (1 unit each). Only videos of 3 minutes or less that are vertical count as Shorts.
4. **Feed**: score = topic weight × creator weight × creator quality × freshness. Then a variety pass: no topic or creator back to back, extra videos from the same topic count for less, and every 5th slot explores a less-watched topic. Seen videos never come back. News expires after 3 days, everything else after 21.
5. **Learn**: 👍/👎 nudge topic weights gently and creator weights more strongly. 👎 also skips to the next video.

## Development

```bash
npm test                         # unit tests: quota, Shorts detection, ranking, feedback, Claude output parsing
node scripts/ui-check.mjs        # phone-width browser check (needs `npm run dev` + demo data)
node scripts/icons.mjs           # re-render app icons from public/icon.svg
```

Keys live only in `.dev.vars` (gitignored) locally and in Cloudflare secrets in production. Never commit them.

## Roadmap

- **Phase 2:** Claude screens every video (drops rage-bait, clickbait, dubious health claims, reposts; stricter for health/news) and writes a one-line "why this matters"; learning from skips, rewatches, "more like this" and "not this creator"; modes (Catch up / Learn / Unwind) and topic mix.
- **Phase 3:** saved shelf by topic, weekly recap, share-to-Curio "watch later" from YouTube/Instagram.
- **Later:** "Read more" context and source links.

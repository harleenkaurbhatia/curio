# Curio

Short videos and reads that make you smarter, in a Reels-style swipe feed. No friends' stories, no follower or like counts, no ads, no trackers.

- **Feed:** YouTube Shorts from creators Curio finds and vets for your topics, mixed with text "reads" from Bluesky, Hacker News and quality newsletters and explainers (Quanta, Nature, Psyche, Aeon, Indian Express Explained, BBC Hindi and more). English, Hindi and Hinglish.
- **On every item:** 👍 / 👎 (the feed learns), 🔖 Save, 🕒 Later, ↗ Share (WhatsApp and any app, with the original link), 💭 Thought (type or speak it in English or Hindi).
- **Library:** Saved, Later and Thoughts, with in-app playback.
- **Insights:** your time today and this week, streak, topic mix, totals. Private to you.
- **Done for now:** ends a session with a calm summary.
- **Accounts:** anyone can sign up with email and password. Each person has their own topics, languages, feed and history.

**Stack:** Cloudflare Workers (free plan) for the app, API, D1 (SQLite) database and a background job every 15 minutes, plus Claude Haiku 5.5 for vetting. Videos play only through the official YouTube player (`youtube-nocookie.com`). Nothing is downloaded or re-hosted.

**Running cost:** YouTube API free; Claude roughly $1–3/month (vetting is shared across all users, so it barely grows with users); Cloudflare free.

## 1. Keys (one time)

| Key | Where |
|---|---|
| `YOUTUBE_API_KEY` | [console.cloud.google.com](https://console.cloud.google.com): new project → *APIs & Services* → *Library* → enable **YouTube Data API v3** → *Credentials* → *Create credentials* → **API key**. Restrict it to that API. |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → *Settings* → *API keys*. Add ~$5 credit under *Billing*. |
| `ADMIN_TOKEN` | Any long random string (`openssl rand -hex 16`). Lets you trigger a refresh by hand. |

## 2. Run locally

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in the keys
npm run db:local                 # create the local database
npm run dev                      # http://localhost:8787
```

The background job only runs on Cloudflare. Locally, trigger it by hand (each call does one small slice of work):

```bash
curl -X POST localhost:8787/api/admin/refresh -H "x-admin-token: $ADMIN_TOKEN"
```

Without keys, `npm run db:demo` adds a few demo videos so you can try the UI.

## 3. Deploy (gives you the download link)

```bash
npx wrangler login
npx wrangler d1 create curio          # paste the printed database_id into wrangler.toml
npm run db:remote
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ADMIN_TOKEN
npm run deploy                        # prints https://curio.<your-subdomain>.workers.dev
```

That URL **is the download link**. Open it in Chrome on Android → sign up → tap **Install Curio** (Profile tab) or Chrome menu ⋮ → **Install app**. It installs like a normal app with its own icon and runs full screen.

Content builds up over the first hour as the job discovers creators, vets them and screens posts.

## How it works

1. **Discover:** for followed topics that are short of creators, one YouTube search in English and one in Hindi (at most once a day per topic; search has its own 100/day quota). Bluesky people are found per topic the same way.
2. **Vet:** Claude scores each channel or person on consistency, clarity and credibility, rejecting clickbait, rage-bait, reposts, low credibility and lifestyle/flex content. Every text post is screened individually and gets a one-line "why read".
3. **Fetch:** each creator is rechecked about every 4 hours (YouTube uploads playlist, 1 unit), feeds every 2 hours. Videos must be 3 minutes or less and vertical.
4. **Rank (per user):** topic weight × creator weight × quality × freshness. Then variety rules: no topic or creator back to back, never two reads in a row, reads at most 40% of a batch, every 5th slot explores a less-watched topic. Seen items never return. News expires after 3 days, everything else after 21.
5. **Learn:** 👍/👎 nudge that user's topic and creator weights.

Each 15-minute run does a capped slice of work (24 requests for videos, 20 for reads) to stay within Cloudflare's free-plan limits.

## Development

```bash
npm test                         # 54 unit tests: ranking, quota, Shorts detection, feed parsers, Claude output parsing, passwords, insights
node scripts/ui-check.mjs        # 26-step phone-width end-to-end check (needs npm run dev + demo data)
```

Secrets live in `.dev.vars` (gitignored) locally and in Cloudflare secrets in production.

## Not yet / next

- Sign in with Google and password-reset emails (need an OAuth client and a sending domain).
- Claude screening of every **video** with a "why this matters" caption (posts already have it); skip and rewatch signals; Catch up / Learn / Unwind modes.
- X posts (paid API, about $10–30/month) behind an optional key. LinkedIn has no official read access, so it isn't planned.
- "Read more" context and source links.

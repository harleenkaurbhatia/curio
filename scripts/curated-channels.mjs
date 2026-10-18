// Resolves well-known creators' @handles to channel IDs and writes a SQL seed (1 quota unit per handle).
// Usage: node scripts/curated-channels.mjs > migrations/000X_curated_channels.sql
import { readFileSync } from 'node:fs';
const key = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/^YOUTUBE_API_KEY=(.*)$/m)[1].trim();
const CURATED = {
  11: ['kunalkapur', 'RanveerBrar', 'YourFoodLab', 'NishaMadhulika', 'sanjeevkapoorkhazana', 'JoshuaWeissman', 'JKenjiLopezAlt', 'bonappetit'],
  9: ['kurzgesagt', 'veritasium', 'Vsauce', 'TEDEd', 'RealLifeLore', 'NileRed', 'StudyIQEducationLtd'],
  7: ['ycombinator', 'ThinkSchool', 'LennysPodcast', 'varunmayya'],
  6: ['Psych2go', 'theschooloflifetv', 'hubermanlab'],
  8: ['Fireship', 'mkbhd', 'TechBurner', 'LinusTechTips'],
  10: ['DoctorMike', 'nutritionfactsorg', 'DrPal'],
  1: ['SciShow', 'smartereveryday', 'MinutePhysics'],
};
const rows = [];
for (const [topic, handles] of Object.entries(CURATED)) for (const h of handles) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&forHandle=@${h}&key=${key}`);
  const c = (await r.json()).items?.[0];
  if (!c) { console.error('not found', h); continue; }
  console.error(topic, h, c.snippet.title, c.statistics.subscriberCount);
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  rows.push(`  (${q(c.id)}, ${q(c.snippet.title)}, ${topic}, ${q(c.snippet.thumbnails?.default?.url ?? '')}, 0.85, 'Curated', 'active', ${q(c.contentDetails.relatedPlaylists.uploads)}, 0)`);
}
console.log(`-- Well-known creators, so every topic has good videos from day one (Claude-found creators add to these).
INSERT OR IGNORE INTO channels (id, title, topic_id, thumb, score, reason, status, uploads_playlist, discovered_at) VALUES
${rows.join(',\n')};`);

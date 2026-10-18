export const POST_ACCEPT_AT = 0.65;
export const POST_REJECT_REASONS = ['clickbait', 'rage_bait', 'lifestyle_flex', 'self_promo', 'low_credibility', 'dubious_health', 'off_topic', 'shallow'] as const;

export type PostScore = { id: string; score: number; accept: boolean; hook: string };

export function parsePostScores(raw: string, askedIds: string[]): PostScore[] {
  let data: any;
  try { data = JSON.parse(raw); } catch { return []; }
  const asked = new Set(askedIds);
  const out: PostScore[] = [];
  for (const r of Array.isArray(data?.posts) ? data.posts : []) {
    if (!asked.has(r?.id) || typeof r.score !== 'number' || r.score < 0 || r.score > 1) continue;
    out.push({ id: r.id, score: r.score, accept: !r.reject_reason && r.score >= POST_ACCEPT_AT, hook: String(r.hook ?? '').slice(0, 140) });
    asked.delete(r.id);
  }
  return out;
}

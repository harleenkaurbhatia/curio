export const ACCEPT_AT = 0.6;
export const REJECT_REASONS = ['clickbait', 'rage_bait', 'lifestyle_flex', 'reposts', 'low_credibility', 'off_topic', 'inactive'] as const;

export type ChannelScore = { id: string; score: number; language: string; accept: boolean; reason: string };

// Validate Claude's JSON. Rows we can't trust are dropped; those channels stay pending and get rescored next run.
export function parseScores(raw: string, askedIds: string[]): ChannelScore[] {
  let data: any;
  try { data = JSON.parse(raw); } catch { return []; }
  const asked = new Set(askedIds);
  const out: ChannelScore[] = [];
  for (const r of Array.isArray(data?.channels) ? data.channels : []) {
    if (!asked.has(r?.id) || typeof r.score !== 'number' || r.score < 0 || r.score > 1) continue;
    const summary = String(r.summary ?? '');
    out.push({
      id: r.id, score: r.score, language: String(r.language ?? 'en'),
      accept: !r.reject_reason && r.score >= ACCEPT_AT,
      reason: r.reject_reason ? `${r.reject_reason}: ${summary}` : summary,
    });
    asked.delete(r.id);
  }
  return out;
}

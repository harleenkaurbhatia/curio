export type View = { topic: string; kind: 'video' | 'post'; ms: number; at: number };
export type Insights = {
  today: { minutes: number; items: number };
  week: { minutes: number; items: number; videos: number; reads: number };
  streak: number;
  last7: boolean[]; // oldest → today
  topics: { topic: string; minutes: number; items: number }[];
};

const DAY = 86_400_000;
const mins = (ms: number) => Math.round((ms / 60_000) * 10) / 10;

// tzOffsetMin: minutes east of UTC (India = 330).
export function computeInsights(views: View[], now: number, tzOffsetMin: number): Insights {
  const dayOf = (t: number) => Math.floor((t + tzOffsetMin * 60_000) / DAY);
  const today = dayOf(now);
  const active = new Set(views.map((v) => dayOf(v.at)));

  const todays = views.filter((v) => dayOf(v.at) === today);
  const week = views.filter((v) => today - dayOf(v.at) < 7);

  let streak = 0;
  for (let d = active.has(today) ? today : today - 1; active.has(d); d--) streak++;

  const byTopic = new Map<string, { ms: number; items: number }>();
  for (const v of week) {
    const t = byTopic.get(v.topic) ?? { ms: 0, items: 0 };
    t.ms += v.ms;
    t.items++;
    byTopic.set(v.topic, t);
  }

  return {
    today: { minutes: mins(todays.reduce((s, v) => s + v.ms, 0)), items: todays.length },
    week: {
      minutes: mins(week.reduce((s, v) => s + v.ms, 0)), items: week.length,
      videos: week.filter((v) => v.kind === 'video').length, reads: week.filter((v) => v.kind === 'post').length,
    },
    streak,
    last7: Array.from({ length: 7 }, (_, i) => active.has(today - 6 + i)),
    topics: [...byTopic.entries()]
      .map(([topic, t]) => ({ topic, minutes: mins(t.ms), items: t.items }))
      .sort((a, b) => b.minutes - a.minutes || b.items - a.items),
  };
}

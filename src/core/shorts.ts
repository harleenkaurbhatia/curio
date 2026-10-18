// ISO-8601 duration (e.g. PT2M30S) → seconds. Unparseable → 0.
export function parseDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

// A Short: 1–180 seconds and taller than wide.
export function isShort(v: { duration: string; embedWidth?: number; embedHeight?: number }): boolean {
  const secs = parseDuration(v.duration);
  if (secs < 1 || secs > 180) return false;
  if (!v.embedWidth || !v.embedHeight) return false;
  return v.embedHeight > v.embedWidth;
}

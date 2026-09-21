// A price arrives from the feed as 78462.70000. Nobody reads it that way.
export function figure(v: string | undefined, lang?: string): string {
  if (!v) return '';
  const n = Number(v);
  if (!v.trim() || !Number.isFinite(n)) return v;
  return new Intl.NumberFormat(lang || undefined, { maximumFractionDigits: 2 }).format(n);
}

// A time today reads as a time; any other day carries its date.
export function when(iso: string | undefined, lang?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const time = d.toLocaleTimeString(lang || undefined, { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === new Date().toDateString()) return time;
    return `${d.toLocaleDateString(lang || undefined, { month: 'short', day: 'numeric' })}, ${time}`;
  } catch {
    return '';
  }
}

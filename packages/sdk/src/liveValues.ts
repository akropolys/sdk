

export interface LiveValue {
  key: string;

  fields: Record<string, string>;

  at: number;

  changedAt: Record<string, number>;
}

type Listener = (key: string) => void;

const values = new Map<string, LiveValue>();
const listeners = new Set<Listener>();

export const LIVE_STALE_AFTER_MS = 30_000;

/** How long a changed field stays highlighted. */
export const LIVE_FLASH_MS = 1_200;

export function setLiveValue(
  key: string,
  fields: Record<string, string>,
  at: number = Date.now(),
): void {
  if (!key || !fields || typeof fields !== 'object') return;
  const prev = values.get(key);
  if (prev && prev.at > at) return;

  const changedAt: Record<string, number> = { ...(prev?.changedAt ?? {}) };
  let moved = !prev;
  for (const name of Object.keys(fields)) {
    if (!prev || prev.fields[name] !== fields[name]) {
      changedAt[name] = at;
      moved = true;
    }
  }
  for (const name of Object.keys(changedAt)) {
    if (!(name in fields)) delete changedAt[name];
  }
  if (!moved && prev && prev.at === at) return;

  values.set(key, { key, fields, at, changedAt });
  for (const l of listeners) {
    try {
      l(key);
    } catch (err) {
      console.error('[Akropolys] live value listener failed:', err);
    }
  }
}

export function getLiveValue(key: string): LiveValue | undefined {
  return values.get(key);
}

export function subscribeLiveValues(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearLiveValues(): void {
  values.clear();
}

export function isStale(v: LiveValue | undefined, now: number = Date.now()): boolean {
  return !!v && now - v.at >= LIVE_STALE_AFTER_MS;
}

export function isFresh(v: LiveValue | undefined, field: string, now: number = Date.now()): boolean {
  const at = v?.changedAt[field];
  return at !== undefined && now - at < LIVE_FLASH_MS;
}

export interface FieldSplit {

  varying: string[];

  shared: [string, string][];
}

export function splitFields(records: (LiveValue | undefined)[]): FieldSplit {
  const present = records.filter((r): r is LiveValue => !!r);
  if (present.length === 0) return { varying: [], shared: [] };

  const counts = new Map<string, number>();
  for (const r of present) {
    for (const name of Object.keys(r.fields)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  const names = [...counts.keys()].sort((a, b) => {
    const shared = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    return shared !== 0 ? shared : a.localeCompare(b);
  });

  const varying: string[] = [];
  const shared: [string, string][] = [];

  for (const name of names) {
    if (/^(token_id|clob_token_id|clobTokenId|condition_id|conditionId|slug)$/i.test(name)) continue;

    const values = present.map(r => r.fields[name]);
    if (values.every(v => v === undefined || v === '')) continue;
    if (values.some(v => typeof v === 'string' && v.length > 25 && /^[0-9a-fA-F-]+$/.test(v))) continue;

    const first = values[0];
    const identical = present.length > 1 && values.every(v => v === first) && first !== undefined;
    if (identical) shared.push([name, first]);
    else varying.push(name);
  }

  return { varying, shared };
}

export function describeAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export function formatLiveValue(name: string, raw: string | undefined): string {
  if (raw === undefined || raw === null || raw === '') return '—';
  const val = String(raw).trim();
  const lowerName = name.toLowerCase();

  if (/^(close_date|expiry|expires_at|end_time|settle_date|closed_at)$/i.test(lowerName) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
      }
    } catch {}
  }

  if (/^(volume|24h_volume|vol|turnover|liquidity|open_interest)$/i.test(lowerName)) {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
      if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
      if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
      return `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
  }

  if (/^(yes_pct|no_pct|pct|probability|prob|implied_prob|change|pct_change)$/i.test(lowerName) || lowerName.includes('pct') || lowerName.includes('percent')) {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const displayPct = num <= 1 && num > 0 && !val.includes('%') && !lowerName.includes('pct') ? num * 100 : num;
      return `${displayPct.toFixed(1).replace(/\.0$/, '')}%`;
    }
  }

  if (/^(yes_price|no_price|price|last_price|nav)$/i.test(lowerName)) {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      if (num > 0 && num < 1 && (lowerName.includes('yes') || lowerName.includes('no'))) {
        const cents = (num * 100).toFixed(1).replace(/\.0$/, '');
        return `${cents}¢ ($${num.toFixed(4)})`;
      }
      if (num >= 1000) return `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      return num < 1 ? num.toFixed(4) : `$${num.toFixed(2)}`;
    }
  }

  const generalNum = Number(val);
  if (!isNaN(generalNum) && /^-?\d+(\.\d+)?$/.test(val)) {
    if (Math.abs(generalNum) >= 1_000_000) return `${(generalNum / 1_000_000).toFixed(2)}M`;
    if (Math.abs(generalNum) >= 1_000) return generalNum.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return generalNum.toString();
  }

  return val;
}

export function labelFor(name: string): string {
  const leaf = name.slice(name.lastIndexOf('.') + 1);
  return leaf
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, c => c.toUpperCase());
}

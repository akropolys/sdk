import { getAkropolysClient } from './client';

/**
 * Batches and streams live record updates to the platform.
 */
export interface LiveRecord {
    key: string;
    fields: Record<string, unknown>;
}

interface PipeOptions {
    flushMs?: number;
    onError?: (err: Error) => void;
    onSkipped?: (skipped: { key: string; reason: string; detail?: string }[]) => void;
}

const pending = new Map<string, LiveRecord>();

const MAX_PENDING = 5000;

let timer: ReturnType<typeof setInterval> | null = null;
let opts: PipeOptions = {};
let inFlight = false;

function requeue(batch: LiveRecord[]): void {
  for (const r of batch) {
    if (!pending.has(r.key) && pending.size < MAX_PENDING) pending.set(r.key, r);
  }
}

async function flush(): Promise<void> {
  if (inFlight || pending.size === 0) return;

  const batch = [...pending.values()];
  pending.clear();
  inFlight = true;

  try {
    const client = getAkropolysClient();
    const { apiUrl, siteId, apiToken } = (client as any).api ?? {};
    if (!apiUrl || !siteId || !apiToken) {
      throw new Error('client is not configured — is this inside <AkropolysProvider>?');
    }

    const res = await fetch(`${apiUrl}/live`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiToken,
        'X-Akropolys-Site': siteId,
      },
      body: JSON.stringify({
        records: batch.map(r => ({ key: r.key, fields: r.fields })),
      }),
    });

    if (!res.ok) {
      const err = new Error(`live ingest failed: HTTP ${res.status}`);
      if (res.status >= 500 || res.status === 429) requeue(batch);
      throw err;
    }

    const body = await res.json().catch(() => null);
    if (body?.skipped?.length && opts.onSkipped) opts.onSkipped(body.skipped);
  } catch (err) {
    if (err instanceof TypeError) requeue(batch);
    opts.onError?.(err as Error);
  } finally {
    inFlight = false;
  }
}

export function pipeLiveData(record: LiveRecord, options?: PipeOptions): void {
  if (!record?.key || !record.fields) return;
  const prevFlushMs = opts.flushMs;
  if (options) opts = { ...opts, ...options };

  if (!pending.has(record.key) && pending.size >= MAX_PENDING) return;
  pending.set(record.key, record);

  if (typeof window === 'undefined') return;
  if (timer && opts.flushMs !== prevFlushMs) {
    clearInterval(timer);
    timer = null;
  }
  if (!timer) timer = setInterval(flush, opts.flushMs ?? 250);
}

export function stopLiveData(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  pending.clear();
}

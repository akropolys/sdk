import { getAkropolysClient } from './client';

export interface LiveRecord { key: string; fields: Record<string, unknown>; }
export interface LiveSkipped { key: string; reason: string; detail?: string; }
export interface LiveIngestResult {
  status: 'accepted' | 'skipped' | 'error';
  error?: Error;
  skipped?: LiveSkipped[];
  retrying?: boolean;
}
export interface PipeOptions {
  flushMs?: number;
  onError?: (err: Error) => void;
  onSkipped?: (skipped: LiveSkipped[]) => void;
  onResult?: (result: LiveIngestResult) => void;
}
type Connection = { apiUrl: string; siteId: string; apiToken: string };
type Pending = { record: LiveRecord; connection: Connection; observers: Set<PipeOptions> };
const pending = new Map<string, Pending>();
const MAX_PENDING = 5000;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false, generation = 0, failures = 0, retryAt = 0, interval = 250;
let controller: AbortController | null = null;
let activeEntries: Pending[] = [];

function identity(connection: Connection, key: string): string {
  return JSON.stringify([connection.apiUrl, connection.siteId, connection.apiToken, key]);
}
function notify(entry: Pending, result: LiveIngestResult): void {
  for (const observer of entry.observers) {
    try {
      observer.onResult?.(result);
      if (result.error) observer.onError?.(result.error);
      if (result.skipped?.length) observer.onSkipped?.(result.skipped);
    } catch (error) { console.error('[Akropolys] Live callback failed', error); }
  }
}
function requeue(entries: Pending[]): void {
  for (const entry of entries) {
    const key = identity(entry.connection, entry.record.key);
    const newer = pending.get(key);
    if (newer) { for (const observer of entry.observers) newer.observers.add(observer); }
    else if (pending.size < MAX_PENDING) pending.set(key, entry);
    else notify(entry, { status: 'error', error: new Error('Live update queue is full'), retrying: false });
  }
}

async function flush(): Promise<void> {
  if (inFlight || pending.size === 0 || Date.now() < retryAt) return;
  const currentGeneration = generation;
  const first = pending.values().next().value!;
  const connection = first.connection;
  const entries: Pending[] = [];
  let bytes = 0;
  for (const [key, entry] of pending) {
    if (identity(entry.connection, '') !== identity(connection, '')) continue;
    try {
      const size = new TextEncoder().encode(JSON.stringify(entry.record)).length + 1;
      if (size > 1_900_000) throw new Error('Live record exceeds the request size limit');
      if (entries.length >= 100 || bytes + size > 1_900_000) break;
      entries.push(entry); bytes += size; pending.delete(key);
    } catch (error) {
      pending.delete(key); notify(entry, { status: 'error', error: error as Error, retrying: false });
    }
  }
  if (!entries.length) return;
  inFlight = true; activeEntries = entries;
  const abort = new AbortController(); controller = abort;
  const timeout = setTimeout(() => abort.abort(), 20_000);
  let retry = true;
  try {
    const res = await fetch(`${connection.apiUrl.replace(/\/+$/, '')}/live`, {
      method: 'POST', signal: abort.signal,
      headers: { 'Content-Type': 'application/json', 'X-Akropolys-Token': connection.apiToken, 'X-Akropolys-Site': connection.siteId },
      body: JSON.stringify({ records: entries.map(e => e.record) }),
    });
    const body = await res.json().catch(() => null);
    if (generation !== currentGeneration) return;
    if (!res.ok || body?.success === false) {
      retry = res.status >= 500 || res.status === 429;
      throw new Error(typeof body?.error === 'string' ? body.error : `Live ingestion failed: HTTP ${res.status}`);
    }
    if (body?.success !== true || !Number.isInteger(body.count) || body.count < 0 || (body.skipped !== undefined && !Array.isArray(body.skipped)) || body.count + (body.skipped?.length ?? 0) !== entries.length) {
      throw new Error('Invalid live ingestion response');
    }
    failures = 0; retryAt = 0;
    for (const entry of entries) {
      const skipped = (body.skipped ?? []).filter((item: LiveSkipped) => item.key.trim() === entry.record.key.trim());
      notify(entry, skipped.length ? { status: 'skipped', skipped } : { status: 'accepted' });
    }
  } catch (error) {
    if (generation !== currentGeneration) return;
    if (retry) {
      failures++; retryAt = Date.now() + Math.min(30_000, 1000 * 2 ** Math.min(failures - 1, 5));
      requeue(entries);
    }
    for (const entry of entries) notify(entry, { status: 'error', error: error as Error, retrying: retry && pending.has(identity(entry.connection, entry.record.key)) });
  } finally {
    clearTimeout(timeout);
    if (generation === currentGeneration) { inFlight = false; controller = null; activeEntries = []; if (!pending.size && timer) {clearInterval(timer);timer=null;} }
  }
}

export function pipeLiveData(record: LiveRecord, options: PipeOptions = {}): void {
  if (typeof window === 'undefined') return;
  let connection: Connection = { apiUrl: '', siteId: '', apiToken: '' };
  const entry: Pending = { record, connection, observers: new Set([options]) };
  try {
    if (!record?.key?.trim() || !record.fields) throw new Error('Live updates require a key and fields');
    const api = (getAkropolysClient() as any).api;
    connection = { apiUrl: api?.apiUrl, siteId: api?.siteId, apiToken: api?.apiToken };
    if (!connection.apiUrl || !connection.siteId || !connection.apiToken) throw new Error('Live client is not configured');
    entry.connection = connection;
    if (options.flushMs !== undefined) {
      if (!Number.isInteger(options.flushMs) || options.flushMs < 50) throw new Error('flushMs must be an integer of at least 50');
      if (interval !== options.flushMs && timer) { clearInterval(timer); timer = null; }
      interval = options.flushMs;
    }
    const key = identity(connection, record.key);
    const previous = pending.get(key);
    if (!previous && pending.size >= MAX_PENDING) throw new Error('Live update queue is full');
    if (previous) for (const observer of previous.observers) entry.observers.add(observer);
    pending.set(key, entry);
    if (!timer) timer = setInterval(flush, interval);
  } catch (error) { notify(entry, { status: 'error', error: error as Error, retrying: false }); }
}

export function stopLiveData(): void {
  generation++; controller?.abort(); controller = null; inFlight = false;
  if (timer) clearInterval(timer);
  timer = null; failures = 0; retryAt = 0; interval = 250;
  for (const entry of pending.values()) notify(entry, { status: 'error', error: new Error('Live updates stopped'), retrying: false });
  pending.clear();
  for (const entry of activeEntries) notify(entry, {status:"error",error:new Error("Live updates stopped"),retrying:false});
  activeEntries=[];
}

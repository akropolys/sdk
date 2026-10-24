import { useState, useCallback } from 'react';
import { useAkropolysContext } from '../Provider';
import { ingestionKey, ingestionFingerprint } from '../ingestionRecord';
import type { IngestResponse } from '../types';

export type RawItem = Record<string, any>;
type IngestStatus = 'idle' | 'loading' | 'success' | 'queued' | 'error';
interface UseIngestReturn {
  ingest: (entity: RawItem) => Promise<void>;
  ingestBatch: (entities: RawItem[]) => Promise<void>;
  status: IngestStatus;
  loading: boolean;
  message: string | null;
  error: Error | null;
}
type Accepted = { fingerprint: string; timestamp: number; queued: boolean; message?: string };
// Scope deduplication to the client/site, and remember only backend acceptance.
const acceptedByClient = new WeakMap<object, Map<string, Accepted>>();
export function useIngest(): UseIngestReturn {
  const client = useAkropolysContext();
  const [status, setStatus] = useState<IngestStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const submit = useCallback(async (entities: RawItem[], batch: boolean) => {
    let cache = acceptedByClient.get(client);
    if (!cache) { cache = new Map(); acceptedByClient.set(client, cache); }
    let cachedQueued = false;
    let cachedMessage: string | undefined;
    setError(null);
    try {
      entities.forEach(ingestionKey);
      const pending = entities.filter(p => {
        const key = ingestionKey(p), cached = cache!.get(key);
        if (cached && cached.fingerprint === ingestionFingerprint(p) && Date.now() - cached.timestamp < (cached.queued ? 30_000 : 86_400_000)) {
          cachedQueued ||= cached.queued;
          if (cached.queued) cachedMessage = cached.message;
          return false;
        }
        return true;
      });
      if (!pending.length) {
        setStatus(cachedQueued ? 'queued' : 'success');
        setMessage(cachedMessage ?? null);
        return;
      }
      setStatus('loading'); setMessage(null);
      const result: IngestResponse = batch ? await client.api.ingestBatch(pending) : await client.api.ingest(pending[0]);
      if (result.success === false) throw new Error(result.message || 'Ingestion failed');
      const queued = (result.queued ?? 0) > 0;
      pending.forEach(p => { const key = ingestionKey(p); cache!.set(key, { fingerprint: ingestionFingerprint(p), timestamp: Date.now(), queued, message: result.message }); });
      setStatus(queued || cachedQueued ? 'queued' : 'success');
      setMessage(queued ? result.message ?? 'Updates queued' : cachedQueued ? cachedMessage ?? 'Updates queued' : result.message ?? null);
    } catch (e: any) {
      setError(e instanceof Error ? e : new Error(typeof e?.message === 'string' ? e.message : String(e)));
      setStatus('error');
    }
  }, [client]);
  const ingest = useCallback((entity: RawItem) => submit([entity], false), [submit]);
  const ingestBatch = useCallback((entities: RawItem[]) => submit(entities, true), [submit]);
  return { ingest, ingestBatch, status, loading: status === 'loading', message, error };
}

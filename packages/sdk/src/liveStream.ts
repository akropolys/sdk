import { getAkropolysClient, AkropolysClient } from './client';
import { setLiveValue } from './liveValues';

/**
 * Subscribes to live WebSocket stream to keep real-time values updated between chat turns.
 */
export interface LiveStreamOptions {

  keys?: string[];
  onError?: (err: Error) => void;

  client?: AkropolysClient;
}

interface StreamRecord {
  key: string;
  fields: Record<string, string>;
  /** epoch ms */
  at: number;
}

export function subscribeLiveStream(options: LiveStreamOptions = {}): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return () => {};
  }

  const client = options.client ?? getAkropolysClient();
  const { apiUrl, siteId, apiToken } = (client as any).api ?? {};
  if (!apiUrl || !siteId || !apiToken) {
    options.onError?.(new Error('subscribeLiveStream: client is not configured — is this inside <AkropolysProvider>?'));
    return () => {};
  }

  let closed = false;
  let ws: WebSocket | null = null;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const wsUrl = apiUrl.replace(/^http/, 'ws');
  const qs = new URLSearchParams({ site_id: siteId });
  if (options.keys?.length) qs.set('keys', options.keys.join(','));

  function connect() {
    if (closed) return;
    ws = new WebSocket(`${wsUrl}/live/stream?${qs}`, [`akropolys.token.${apiToken}`]);

    ws.onopen = () => { attempt = 0; };

    ws.onmessage = ev => {
      let frame: { type?: string; records?: StreamRecord[] };
      try { frame = JSON.parse(ev.data); } catch { return; }
      if (!Array.isArray(frame.records)) return;
      for (const r of frame.records) {
        if (!r?.key || !r.fields) continue;
        setLiveValue(r.key, r.fields, r.at);
      }
    };

    ws.onerror = () => {
      options.onError?.(new Error('live stream socket error'));
    };

    ws.onclose = () => {
      if (closed) return;
      const delay = Math.min(15_000, 1000 * 2 ** attempt++);
      retryTimer = setTimeout(connect, delay);
    };
  }

  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    ws?.close();
  };
}

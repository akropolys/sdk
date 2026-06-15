import { AkropolysConfig, ContentIngestPayload, ChatAttachment } from './types';
import { AkropolysAPI } from './api';
import { KikuStream } from './stream';
import { initContentIndexer } from './content/contentIndexer';
import { stableStringify } from './utils/stableStringify';

declare const process: any;

let defaultVertical: string = 'commerce';
export function setSDKDefaultVertical(v: string) {
  defaultVertical = v;
}

function getEnvVar(key: string): string | undefined {
  if (key === 'NEXT_PUBLIC_AKROPOLYS_SITE_ID') {
    try { return process.env.NEXT_PUBLIC_AKROPOLYS_SITE_ID || process.env.NEXT_PUBLIC_HUSKEL_SITE_ID; } catch { /* ignore */ }
  }
  if (key === 'NEXT_PUBLIC_AKROPOLYS_API_URL') {
    try { return process.env.NEXT_PUBLIC_AKROPOLYS_API_URL || process.env.NEXT_PUBLIC_HUSKEL_API_URL; } catch { /* ignore */ }
  }
  if (key === 'NEXT_PUBLIC_AKROPOLYS_API_TOKEN') {
    try { return process.env.NEXT_PUBLIC_AKROPOLYS_API_TOKEN || process.env.NEXT_PUBLIC_HUSKEL_API_TOKEN; } catch { /* ignore */ }
  }

  // Fallback check for Vite (import.meta.env)
  try {
    const metaEnv = (import.meta as any).env;
    if (metaEnv) {
      if (key === 'NEXT_PUBLIC_AKROPOLYS_SITE_ID') return metaEnv.NEXT_PUBLIC_AKROPOLYS_SITE_ID || metaEnv.VITE_AKROPOLYS_SITE_ID || metaEnv.NEXT_PUBLIC_HUSKEL_SITE_ID;
      if (key === 'NEXT_PUBLIC_AKROPOLYS_API_URL') return metaEnv.NEXT_PUBLIC_AKROPOLYS_API_URL || metaEnv.VITE_AKROPOLYS_API_URL || metaEnv.NEXT_PUBLIC_HUSKEL_API_URL;
      if (key === 'NEXT_PUBLIC_AKROPOLYS_API_TOKEN') return metaEnv.NEXT_PUBLIC_AKROPOLYS_API_TOKEN || metaEnv.VITE_AKROPOLYS_API_TOKEN || metaEnv.NEXT_PUBLIC_HUSKEL_API_TOKEN;
    }
  } catch { /* ignore */ }

  if (typeof globalThis !== 'undefined') {
    const g = globalThis as any;
    if (g.process && g.process.env) {
      const val = g.process.env[key];
      if (val !== undefined) return val;
      if (key === 'NEXT_PUBLIC_AKROPOLYS_SITE_ID') return g.process.env.NEXT_PUBLIC_HUSKEL_SITE_ID;
      if (key === 'NEXT_PUBLIC_AKROPOLYS_API_URL') return g.process.env.NEXT_PUBLIC_HUSKEL_API_URL;
      if (key === 'NEXT_PUBLIC_AKROPOLYS_API_TOKEN') return g.process.env.NEXT_PUBLIC_HUSKEL_API_TOKEN;
    }
  }
  return undefined;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface DisplayFields {
  title: string;
  image?: string;
  price?: string;
  subtitle?: string;
}

export function resolveDisplayFields(fields: Record<string, any>, display?: import('./types').DisplayConfig): DisplayFields {
  const titleKey = display?.cardTitle || '';
  const imageKey = display?.cardImage || '';
  const subtitleKey = display?.cardSubtitle || '';
  const priceKey = display?.cardPrice || '';

  // Title resolution with strict priority and URL checks
  const commonTitleKeys = ['title', 'name', 'label', 'headline', 'subject', 'job_title', 'listing_title', 'common_name'];
  let title = fields[titleKey] || '';
  if (!title) {
    for (const k of commonTitleKeys) {
      if (typeof fields[k] === 'string' && fields[k].trim() !== '') {
        title = fields[k];
        break;
      }
    }
  }
  if (!title) {
    const fallbackStr = Object.values(fields).find(v => 
      typeof v === 'string' && 
      v.length >= 2 && 
      v.length <= 80 && 
      !v.startsWith('http://') && 
      !v.startsWith('https://')
    );
    title = fallbackStr || 'Untitled';
  }

  // Image resolution
  const commonImageKeys = ['image', 'images', 'thumbnail', 'photo', 'cover', 'featured_image'];
  let image = fields[imageKey] || undefined;
  if (!image) {
    for (const k of commonImageKeys) {
      const v = fields[k];
      if (typeof v === 'string' && v.startsWith('http')) {
        image = v;
        break;
      } else if (Array.isArray(v) && typeof v[0] === 'string' && v[0].startsWith('http')) {
        image = v[0];
        break;
      }
    }
  }

  return {
    title,
    image,
    price:    fields[priceKey] ?? fields.price ?? fields.cost ?? fields.listingPrice,
    subtitle: fields[subtitleKey] ?? fields.brand ?? fields.category,
  };
}

export class AkropolysClient {
  readonly api: AkropolysAPI;
  readonly vertical: string;
  readonly display?: import('./types').DisplayConfig;
  private ingestQueue: Record<string, any>[] = [];
  private ingestTimer: ReturnType<typeof setTimeout> | null = null;
  private ingestedUrls = new Map<string, string>();
  private onlineHandler: (() => void) | null = null;
  private shopperId?: string;
  private sessionId: string = '';
  private deviceId: string = '';
  private authLoading?: boolean;
  public onCheckout?: (cart: import('./types').CartPayload) => void;
  public onError?: (error: import('./types').AkropolysError) => void;

  private isFlushing = false;
  private retryCount = 0;

  private contentQueue: ContentIngestPayload[] = [];
  private contentIngestTimer: ReturnType<typeof setTimeout> | null = null;
  private isContentFlushing = false;
  private contentRetryCount = 0;
  private contentIndexerCleanup: (() => void) | null = null;
  private lastIngestedItem: Record<string, any> | null = null;


  private static INGEST_CACHE_KEY = 'akropolys_ingested_v3';
  private static INGEST_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

  private loadIngestedCache() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(AkropolysClient.INGEST_CACHE_KEY);
      if (!raw) return;
      const { ts, urlFingerprints }: { ts: number; urlFingerprints: [string, string][] } = JSON.parse(raw);
      if (Date.now() - ts > AkropolysClient.INGEST_CACHE_TTL) {
        localStorage.removeItem(AkropolysClient.INGEST_CACHE_KEY);
        return;
      }
      this.ingestedUrls = new Map(urlFingerprints);
    } catch { /* ignore */ }
  }

  private saveIngestedCache() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        AkropolysClient.INGEST_CACHE_KEY,
        JSON.stringify({ ts: Date.now(), urlFingerprints: Array.from(this.ingestedUrls.entries()) })
      );
    } catch { /* ignore */ }
  }

  constructor(config: AkropolysConfig) {
    const siteId = config.siteId || getEnvVar('NEXT_PUBLIC_AKROPOLYS_SITE_ID') || '';
    const apiUrl = config.apiUrl || getEnvVar('NEXT_PUBLIC_AKROPOLYS_API_URL') || '';
    const apiToken = config.apiToken || getEnvVar('NEXT_PUBLIC_AKROPOLYS_API_TOKEN') || '';

    // Runtime validation — fail loudly so misconfiguration is never silent
    if (!siteId) console.error('[Akropolys] Missing siteId. Set it via <AkropolysProvider siteId="..."> or NEXT_PUBLIC_AKROPOLYS_SITE_ID.');
    if (!apiUrl) console.error('[Akropolys] Missing apiUrl. Set it via <AkropolysProvider apiUrl="..."> or NEXT_PUBLIC_AKROPOLYS_API_URL.');
    if (!apiToken) console.error('[Akropolys] Missing apiToken. Set it via <AkropolysProvider apiToken="..."> or NEXT_PUBLIC_AKROPOLYS_API_TOKEN.');

    this.shopperId = config.shopperId;
    this.authLoading = config.authLoading;
    this.onCheckout = config.onCheckout;
    this.onError = config.onError;
    this.vertical = config.vertical || defaultVertical;
    this.display = config.display;
    this.initSession();
    this.initDevice();
    this.loadIngestedCache();

    this.api = new AkropolysAPI(
      apiUrl,
      siteId,
      apiToken,
      () => this.getShopperId(),
      () => this.sessionId,
      this.vertical,
      () => this.deviceId
    );
    instance = this;

    if (typeof window !== 'undefined') {
      this.onlineHandler = () => {
        console.log('[Akropolys] Connectivity restored, flushing queued ingestions.');
        this.flushQueue();
        this.flushContentQueue();
      };
      window.addEventListener('online', this.onlineHandler);
    }

    if (config.indexContent) {
      initContentIndexer(this);
    }
  }

  getCurrentContext(): any {
    if (typeof window === 'undefined') return null;
    const ctx: any = {
      url: window.location.href,
      title: document.title,
      raw: {}
    };
    if (this.lastIngestedItem) {
      const itemUrl = this.lastIngestedItem.url;
      if (itemUrl) {
        try {
          const parsedUrl = new URL(itemUrl, window.location.origin);
          if (parsedUrl.pathname === window.location.pathname) {
            ctx.raw = this.lastIngestedItem;
            ctx.url = parsedUrl.href;
            if (this.lastIngestedItem.name || this.lastIngestedItem.title) {
              ctx.title = this.lastIngestedItem.name || this.lastIngestedItem.title;
            }
          }
        } catch {
          if (window.location.href.endsWith(itemUrl) || itemUrl.endsWith(window.location.pathname)) {
            ctx.raw = this.lastIngestedItem;
            try {
              ctx.url = new URL(itemUrl, window.location.origin).href;
            } catch {
              ctx.url = itemUrl;
            }
            if (this.lastIngestedItem.name || this.lastIngestedItem.title) {
              ctx.title = this.lastIngestedItem.name || this.lastIngestedItem.title;
            }
          }
        }
      }
    }
    return ctx;
  }

  chat(query: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = [], attachments?: ChatAttachment[]): KikuStream {
    const abortController = new AbortController();
    const currentContext = this.getCurrentContext();
    const responsePromise = this.api.chatStream(query, history, abortController.signal, currentContext, attachments);
    return new KikuStream(responsePromise, abortController);
  }

  reRegister() {
    instance = this;
    if (typeof window !== 'undefined' && !this.onlineHandler) {
      this.onlineHandler = () => this.flushQueue();
      window.addEventListener('online', this.onlineHandler);
    }
  }

  updateConfig(config: Partial<AkropolysConfig>) {
    if (config.apiUrl) this.api.apiUrl = config.apiUrl;
    if (config.siteId) this.api.siteId = config.siteId;
    if (config.apiToken) this.api.apiToken = config.apiToken;
    if (config.vertical !== undefined) {
      (this as any).vertical = config.vertical;
      this.api.vertical = config.vertical;
    }
    if (config.display !== undefined) {
      (this as any).display = config.display;
    }
  }

  setShopperId(id: string | undefined) {
    this.shopperId = id;
    if (!this.authLoading) {
      this.flushQueue();
    }
  }

  setAuthLoading(loading: boolean) {
    const wasLoading = this.authLoading;
    this.authLoading = loading;
    if (wasLoading && !loading) {
      this.flushQueue();
    }
  }

  getShopperId(): string | undefined {
    return this.shopperId || 'guest_' + this.sessionId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  private initSession() {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        let sid = window.sessionStorage.getItem('akropolys_session_id');
        if (!sid) {
          sid = generateUUID();
          window.sessionStorage.setItem('akropolys_session_id', sid);
        }
        this.sessionId = sid;
        return;
      } catch (e) {
        // Fallback if sessionStorage is disabled or private mode
      }
    }
    this.sessionId = generateUUID();
  }

  /**
   * Persistent device identity — survives page reloads and is shared across
   * all Akropolys-powered sites on the same browser. This is the key for
   * Kiku cross-site capture/memory without requiring a login or phone number.
   *
   * To transfer identity to another device, the user exports/imports this ID
   * via a "link device" flow (future feature).
   */
  private initDevice() {
    if (typeof window === 'undefined') {
      this.deviceId = generateUUID();
      return;
    }
    try {
      let did = localStorage.getItem('akropolys_device_id');
      if (!did) {
        did = generateUUID();
        localStorage.setItem('akropolys_device_id', did);
      }
      this.deviceId = did;
    } catch {
      this.deviceId = generateUUID();
    }
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  destroy() {
    if (typeof window !== 'undefined' && this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
    if (this.ingestTimer) {
      clearTimeout(this.ingestTimer);
      this.ingestTimer = null;
    }
    if (this.contentIngestTimer) {
      clearTimeout(this.contentIngestTimer);
      this.contentIngestTimer = null;
    }
    if (this.contentIndexerCleanup) {
      this.contentIndexerCleanup();
      this.contentIndexerCleanup = null;
    }
    if (instance === this) instance = null;
  }

  async queueIngest(rawItem: Record<string, any>): Promise<void> {
    this.lastIngestedItem = rawItem;
    // 1. Identity resolution
    const id = rawItem.id ?? rawItem.productId ?? rawItem.slug ?? rawItem.url ?? rawItem.name ?? '';
    const url = rawItem.url || (typeof window !== 'undefined' ? window.location.href : '');

    if (!id && !url) {
      console.warn('[Akropolys] Ingestion warning: Item is missing both a stable identifier and a URL. Skipping.');
      return;
    }

    // 2. URL deduplication
    const fingerprint = stableStringify(rawItem);
    if (url) {
      if (this.ingestedUrls.get(url) === fingerprint) {
        return;
      }
      this.ingestedUrls.set(url, fingerprint);
      this.saveIngestedCache();
    }

    // 3. Enqueue raw
    this.ingestQueue.push(rawItem);
    this.scheduleFlush();
  }

  async queueIngestBatch(rawItems: Record<string, any>[]): Promise<void> {
    if (rawItems.length > 0) {
      this.lastIngestedItem = rawItems[rawItems.length - 1];
    }
    let hasNew = false;
    rawItems.forEach(rawItem => {
      const id = rawItem.id ?? rawItem.productId ?? rawItem.slug ?? rawItem.url ?? rawItem.name ?? '';
      const url = rawItem.url || (typeof window !== 'undefined' ? window.location.href : '');

      if (!id && !url) {
        console.warn('[Akropolys] Ingestion warning: Item is missing both a stable identifier and a URL. Skipping.');
        return;
      }

      const fingerprint = stableStringify(rawItem);
      if (url) {
        if (this.ingestedUrls.get(url) === fingerprint) {
          return;
        }
        this.ingestedUrls.set(url, fingerprint);
        hasNew = true;
      }

      this.ingestQueue.push(rawItem);
    });

    if (hasNew) {
      this.saveIngestedCache();
    }
    if (this.ingestQueue.length > 0) {
      this.scheduleFlush();
    }
  }

  private scheduleFlush() {
    if (this.ingestTimer || this.isFlushing) return;
    this.ingestTimer = setTimeout(() => {
      this.flushQueue();
    }, 300);
  }

  private async flushQueue() {
    if (this.isFlushing) return;
    this.isFlushing = true;

    if (this.ingestTimer) {
      clearTimeout(this.ingestTimer);
      this.ingestTimer = null;
    }

    if (this.authLoading) {
      console.log('[Akropolys] Authentication is loading. Deferring ingestion flush.');
      this.isFlushing = false;
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.warn('[Akropolys] Browser offline. Postponing ingestion.');
      this.isFlushing = false;
      return;
    }

    const maxBatchSize = 50;

    try {
      while (this.ingestQueue.length > 0) {
        const batch = this.ingestQueue.slice(0, maxBatchSize);

        try {
          await this.api.ingestBatch(batch);
          // Only on success (2xx) — dequeue confirmed items
          this.ingestQueue.splice(0, batch.length);
          this.retryCount = 0; // reset retry counter on success
        } catch (e: any) {
          const status = e.status || 500;
          const message = e.message || 'Unknown network error';

          if (this.onError) {
            try {
              this.onError({ status, message });
            } catch (err) {
              console.error('[Akropolys] Error inside onError callback:', err);
            }
          }

          if (status >= 400 && status < 500 && status !== 429) {
            // Permanent failure — discard and log warning
            console.error('[Akropolys] Ingestion discarded due to client error:', message);
            this.ingestQueue.splice(0, batch.length);
            continue; // Continue processing subsequent batches if any
          } else {
            // Temporary failure (5xx, timeout, 429) — keep items, break loop, retry later
            console.warn('[Akropolys] Ingestion temporarily failed. Retrying later.', message);
            this.scheduleFlushWithBackoff();
            break;
          }
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private scheduleFlushWithBackoff() {
    if (this.ingestTimer) return;
    const baseDelay = 1000; // 1s
    const jitter = Math.random() * 1000;
    const delay = Math.min(baseDelay * Math.pow(2, this.retryCount), 30000) + jitter;
    this.retryCount++;
    this.ingestTimer = setTimeout(() => {
      this.flushQueue();
    }, delay);
  }

  async queueContentIngest(payload: ContentIngestPayload): Promise<void> {
    this.contentQueue.push(payload);
    this.scheduleContentFlush();
  }

  private scheduleContentFlush() {
    if (this.contentIngestTimer || this.isContentFlushing) return;
    this.contentIngestTimer = setTimeout(() => {
      this.flushContentQueue();
    }, 300);
  }

  private async flushContentQueue() {
    if (this.isContentFlushing) return;
    this.isContentFlushing = true;

    if (this.contentIngestTimer) {
      clearTimeout(this.contentIngestTimer);
      this.contentIngestTimer = null;
    }

    if (this.authLoading) {
      console.log('[Akropolys] Authentication is loading. Deferring content ingestion flush.');
      this.isContentFlushing = false;
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.warn('[Akropolys] Browser offline. Postponing content ingestion.');
      this.isContentFlushing = false;
      return;
    }

    const maxBatchSize = 50;

    try {
      while (this.contentQueue.length > 0) {
        const batch = this.contentQueue.slice(0, maxBatchSize);

        try {
          await this.api.ingestContentBatch(batch);
          this.contentQueue.splice(0, batch.length);
          this.contentRetryCount = 0; // reset retry counter on success
        } catch (e: any) {
          const status = e.status || 500;
          const message = e.message || 'Unknown network error';

          if (this.onError) {
            try {
              this.onError({ status, message });
            } catch (err) {
              console.error('[Akropolys] Error inside onError callback:', err);
            }
          }

          if (status >= 400 && status < 500 && status !== 429) {
            // Permanent failure — discard and log warning
            console.error('[Akropolys] Content ingestion discarded due to client error:', message);
            this.contentQueue.splice(0, batch.length);
            continue;
          } else {
            // Temporary failure (5xx, timeout, 429) — keep items, break loop, retry later
            console.warn('[Akropolys] Content ingestion temporarily failed. Retrying later.', message);
            this.scheduleContentFlushWithBackoff();
            break;
          }
        }
      }
    } finally {
      this.isContentFlushing = false;
    }
  }

  private scheduleContentFlushWithBackoff() {
    if (this.contentIngestTimer) return;
    const baseDelay = 1000; // 1s
    const jitter = Math.random() * 1000;
    const delay = Math.min(baseDelay * Math.pow(2, this.contentRetryCount), 30000) + jitter;
    this.contentRetryCount++;
    this.contentIngestTimer = setTimeout(() => {
      this.flushContentQueue();
    }, delay);
  }
}

let instance: AkropolysClient | null = null;

export function initAkropolys(config: AkropolysConfig): AkropolysClient {
  instance = new AkropolysClient(config);
  return instance;
}

export function getAkropolysClient(): AkropolysClient {
  if (!instance) {
    const siteId = getEnvVar('NEXT_PUBLIC_AKROPOLYS_SITE_ID');
    const apiUrl = getEnvVar('NEXT_PUBLIC_AKROPOLYS_API_URL');
    const apiToken = getEnvVar('NEXT_PUBLIC_AKROPOLYS_API_TOKEN');

    if (siteId && apiUrl && apiToken) {
      instance = new AkropolysClient({ siteId, apiUrl, apiToken });
    } else {
      throw new Error('[Akropolys] Call initAkropolys() or set NEXT_PUBLIC_AKROPOLYS_* environment variables before using the client.');
    }
  }
  return instance;
}

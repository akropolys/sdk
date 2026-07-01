import { AkropolysConfig, ContentIngestPayload, ChatAttachment } from './types';
import { AkropolysAPI } from './api';
import { KikuStream } from './stream';
import { initContentIndexer } from './content/contentIndexer';
import { stableStringify } from './utils/stableStringify';

declare const process: any;

function getEnvVar(key: string): string | undefined {
  if (key === 'NEXT_PUBLIC_AKROPOLYS_SITE_ID') {
    try { return process.env.NEXT_PUBLIC_AKROPOLYS_SITE_ID; } catch { /* ignore */ }
  }
  if (key === 'NEXT_PUBLIC_AKROPOLYS_API_URL') {
    try { return process.env.NEXT_PUBLIC_AKROPOLYS_API_URL; } catch { /* ignore */ }
  }
  if (key === 'NEXT_PUBLIC_AKROPOLYS_API_TOKEN') {
    try { return process.env.NEXT_PUBLIC_AKROPOLYS_API_TOKEN; } catch { /* ignore */ }
  }

  // Fallback check for Vite (import.meta.env)
  try {
    const metaEnv = (import.meta as any).env;
    if (metaEnv) {
      if (key === 'NEXT_PUBLIC_AKROPOLYS_SITE_ID') return metaEnv.NEXT_PUBLIC_AKROPOLYS_SITE_ID || metaEnv.VITE_AKROPOLYS_SITE_ID;
      if (key === 'NEXT_PUBLIC_AKROPOLYS_API_URL') return metaEnv.NEXT_PUBLIC_AKROPOLYS_API_URL || metaEnv.VITE_AKROPOLYS_API_URL;
      if (key === 'NEXT_PUBLIC_AKROPOLYS_API_TOKEN') return metaEnv.NEXT_PUBLIC_AKROPOLYS_API_TOKEN || metaEnv.VITE_AKROPOLYS_API_TOKEN;
    }
  } catch { /* ignore */ }

  if (typeof globalThis !== 'undefined') {
    const g = globalThis as any;
    if (g.process && g.process.env) {
      const val = g.process.env[key];
      if (val !== undefined) return val;
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
  readonly entities = {
    query: async (
      params: { q: string },
      options?: { signal?: AbortSignal; onToken?: (token: string) => void }
    ): Promise<void> => {
      const stream = this.chat(params.q);
      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          stream.destroy();
        });
      }
      return new Promise<void>((resolve, reject) => {
        stream.on('token', (token: string) => {
          options?.onToken?.(token);
        });
        stream.on('error', (err: any) => {
          reject(err);
        });
        stream.on('done', () => {
          resolve();
        });
      });
    }
  };
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

  private contextProviders: Array<(signal?: AbortSignal) => Promise<Record<string, any>>> = [];

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

  static readonly DEFAULT_API_URL = 'https://api.akropolys.cloud/v1';

  constructor(config: AkropolysConfig) {
    const siteId = config.siteId || getEnvVar('NEXT_PUBLIC_AKROPOLYS_SITE_ID') || '';
    // Every site shares the same managed backend — only self-hosted/local dev
    // needs to override this via apiUrl or NEXT_PUBLIC_AKROPOLYS_API_URL.
    const apiUrl = config.apiUrl || getEnvVar('NEXT_PUBLIC_AKROPOLYS_API_URL') || AkropolysClient.DEFAULT_API_URL;
    const apiToken = config.apiToken || getEnvVar('NEXT_PUBLIC_AKROPOLYS_API_TOKEN') || '';

    // Runtime validation — fail loudly so misconfiguration is never silent
    if (!siteId) console.error('[Akropolys] Missing siteId. Set it via <AkropolysProvider siteId="..."> or NEXT_PUBLIC_AKROPOLYS_SITE_ID.');
    if (!apiToken) console.error('[Akropolys] Missing apiToken. Set it via <AkropolysProvider apiToken="..."> or NEXT_PUBLIC_AKROPOLYS_API_TOKEN.');

    this.shopperId = config.shopperId;
    this.authLoading = config.authLoading;
    this.onCheckout = config.onCheckout;
    this.onError = config.onError;
    this.vertical = config.vertical || 'commerce';
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
    setInstance(this);

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

  registerContextProvider(fn: (signal?: AbortSignal) => Promise<Record<string, any>>): () => void {
    this.contextProviders.push(fn);
    return () => {
      this.contextProviders = this.contextProviders.filter(p => p !== fn);
    };
  }

  private async getCurrentContextAsync(signal?: AbortSignal): Promise<any> {
    const base = this.getCurrentContext();
    if (this.contextProviders.length === 0) return base ?? {};
    const results = await Promise.all(
      this.contextProviders.map(fn =>
        Promise.race([
          fn(signal),
          new Promise<Record<string, any>>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 3000)
          ),
        ]).catch(err => {
          console.warn('[Akropolys] Live context provider failed:', err?.message ?? err);
          return {} as Record<string, any>;
        })
      )
    );
    const merged = Object.assign({}, ...results);
    const safeBase = base ?? {};
    return { ...safeBase, raw: { ...(safeBase.raw ?? {}), ...merged } };
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
    const responsePromise = this.getCurrentContextAsync(abortController.signal).then(ctx =>
      this.api.chatStream(query, history, abortController.signal, ctx, attachments)
    );
    return new KikuStream(responsePromise, abortController);
  }

  reRegister() {
    setInstance(this);
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
   * Persistent device identity — survives reloads, but is scoped to THIS origin
   * only (localStorage is partitioned per site by the browser). It gives
   * anonymous within-site continuity. For capture/memory that follows the
   * shopper ACROSS sites and devices, use setShopperIdentity(phone, magicWord).
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

  /**
   * Enable cross-site Kiku capture/memory. The phone + magic word together form
   * the shopper's identity: enter the SAME pair on any site/device to recall
   * what was saved. The word is never sent or stored in plaintext server-side —
   * it's folded into a hash; a wrong word simply opens a different empty space.
   * Tip: the word is the only secret (phone numbers are semi-public), so pick a
   * memorable, non-obvious one — if forgotten, saved items can't be recovered.
   */
  setShopperIdentity(phone: string, magicWord: string): void {
    if (typeof window === 'undefined') return;
    const p = (phone || '').trim();
    const w = (magicWord || '').trim();
    if (p) localStorage.setItem('akropolys_user_phone', p);
    if (w) localStorage.setItem('akropolys_user_secret', w);
  }

  /** Sign out of cross-site identity on this device (saves remain on the server). */
  clearShopperIdentity(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('akropolys_user_phone');
    localStorage.removeItem('akropolys_user_secret');
  }

  destroy() {
    this.contextProviders = [];
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
    if (getInstance() === this) setInstance(null);
  }

  /** @deprecated Use ingest() instead */
  async queueIngest(rawItem: Record<string, any>): Promise<void> {
    return this.ingest(rawItem);
  }

  /** @deprecated Use ingestMany() instead */
  async queueIngestBatch(rawItems: Record<string, any>[]): Promise<void> {
    return this.ingestMany(rawItems);
  }

  /**
   * Ingest a single entity.
   * @see Entity for the contract
   */
  async ingest<T extends Record<string, any>>(entity: T): Promise<void> {
    this.lastIngestedItem = entity;
    // 1. Identity resolution
    const id = entity.id ?? (entity as any).productId ?? (entity as any).slug ?? entity.url ?? (entity as any).name ?? '';
    const url = entity.url || (typeof window !== 'undefined' ? window.location.href : '');

    if (!id && !url) {
      console.warn('[Akropolys] Ingestion warning: Item is missing both a stable identifier and a URL. Skipping.');
      return;
    }

    // 2. URL deduplication
    const fingerprint = stableStringify(entity);
    if (url) {
      if (this.ingestedUrls.get(url) === fingerprint) {
        return;
      }
      this.ingestedUrls.set(url, fingerprint);
      this.saveIngestedCache();
    }

    // 3. Enqueue raw
    this.ingestQueue.push(entity);
    this.scheduleFlush();
  }

  /**
   * Ingest multiple entities.
   * @see Entity for the contract
   */
  async ingestMany<T extends Record<string, any>>(entities: T[]): Promise<void> {
    if (entities.length > 0) {
      this.lastIngestedItem = entities[entities.length - 1];
    }
    let hasNew = false;
    entities.forEach(entity => {
      const id = entity.id ?? (entity as any).productId ?? (entity as any).slug ?? entity.url ?? (entity as any).name ?? '';
      const url = entity.url || (typeof window !== 'undefined' ? window.location.href : '');

      if (!id && !url) {
        console.warn('[Akropolys] Ingestion warning: Item is missing both a stable identifier and a URL. Skipping.');
        return;
      }

      const fingerprint = stableStringify(entity);
      if (url) {
        if (this.ingestedUrls.get(url) === fingerprint) {
          return;
        }
        this.ingestedUrls.set(url, fingerprint);
        hasNew = true;
      }

      this.ingestQueue.push(entity);
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

// The active client is stored on globalThis (not a module-local variable) so it
// is shared even when a bundler/package manager ends up with multiple copies of
// this package — e.g. an app and a UI library each resolving their own
// @akropolys/sdk. Without this, the widget's copy can't see the client the app's
// copy created, and every request fires with no apiUrl ("Failed to fetch").
const GLOBAL_KEY = '__akropolys_client__';

function getInstance(): AkropolysClient | null {
  return (globalThis as any)[GLOBAL_KEY] ?? null;
}

function setInstance(c: AkropolysClient | null): void {
  (globalThis as any)[GLOBAL_KEY] = c;
}

export function initAkropolys(config: AkropolysConfig): AkropolysClient {
  const c = new AkropolysClient(config);
  setInstance(c);
  return c;
}

export function getAkropolysClient(): AkropolysClient {
  let instance = getInstance();
  if (!instance) {
    const siteId = getEnvVar('NEXT_PUBLIC_AKROPOLYS_SITE_ID');
    const apiUrl = getEnvVar('NEXT_PUBLIC_AKROPOLYS_API_URL');
    const apiToken = getEnvVar('NEXT_PUBLIC_AKROPOLYS_API_TOKEN');

    if (siteId && apiToken) {
      instance = new AkropolysClient({ siteId, apiUrl, apiToken });
      setInstance(instance);
    } else {
      throw new Error('[Akropolys] Call initAkropolys() or set NEXT_PUBLIC_AKROPOLYS_* environment variables before using the client.');
    }
  }
  return instance;
}

import { AkropolysConfig, Product, RawProductInput } from './types';
import { AkropolysAPI } from './api';
import { stableStringify } from './utils/stableStringify';

declare const process: any;

let defaultVertical: string = 'commerce';
export function setSDKDefaultVertical(v: string) {
  defaultVertical = v;
}

function getEnvVar(key: string): string | undefined {
  if (key === 'NEXT_PUBLIC_HUSKEL_SITE_ID') {
    try { return process.env.NEXT_PUBLIC_HUSKEL_SITE_ID; } catch { /* ignore */ }
  }
  if (key === 'NEXT_PUBLIC_HUSKEL_API_URL') {
    try { return process.env.NEXT_PUBLIC_HUSKEL_API_URL; } catch { /* ignore */ }
  }
  if (key === 'NEXT_PUBLIC_HUSKEL_API_TOKEN') {
    try { return process.env.NEXT_PUBLIC_HUSKEL_API_TOKEN; } catch { /* ignore */ }
  }

  if (typeof globalThis !== 'undefined') {
    const g = globalThis as any;
    if (g.process && g.process.env) {
      return g.process.env[key];
    }
  }
  return undefined;
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

function mapRawProduct(input: RawProductInput): Product | null {
  let url = input.url || '';
  if (!url && typeof window !== 'undefined') {
    url = window.location.href;
  }
  if (!url) {
    console.warn('[Akropolys] Validation warning: Product URL is missing. Skipping:', input);
    return null;
  }

  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k !== 'url' && v !== undefined) {
      fields[k] = v;
    }
  }

  return {
    url,
    fields,
  };
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

export class AkropolysClient {
  readonly api: AkropolysAPI;
  readonly vertical: string;
  readonly display?: import('./types').DisplayConfig;
  private ingestQueue: Product[] = [];
  private ingestTimer: ReturnType<typeof setTimeout> | null = null;
  private ingestedUrls = new Map<string, string>();
  private onlineHandler: (() => void) | null = null;
  private shopperId?: string;
  private sessionId: string = '';
  private authLoading?: boolean;
  public onCheckout?: (cart: import('./types').CartPayload) => void;
  public onError?: (error: import('./types').AkropolysError) => void;

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
    const siteId = config.siteId || getEnvVar('NEXT_PUBLIC_HUSKEL_SITE_ID') || '';
    const apiUrl = config.apiUrl || getEnvVar('NEXT_PUBLIC_HUSKEL_API_URL') || '';
    const apiToken = config.apiToken || getEnvVar('NEXT_PUBLIC_HUSKEL_API_TOKEN') || '';

    // Runtime validation — fail loudly so misconfiguration is never silent
    if (!siteId) console.error('[Akropolys] Missing siteId. Set it via <AkropolysProvider siteId="..."> or NEXT_PUBLIC_HUSKEL_SITE_ID.');
    if (!apiUrl) console.error('[Akropolys] Missing apiUrl. Set it via <AkropolysProvider apiUrl="..."> or NEXT_PUBLIC_HUSKEL_API_URL.');
    if (!apiToken) console.error('[Akropolys] Missing apiToken. Set it via <AkropolysProvider apiToken="..."> or NEXT_PUBLIC_HUSKEL_API_TOKEN.');

    this.shopperId = config.shopperId;
    this.authLoading = config.authLoading;
    this.onCheckout = config.onCheckout;
    this.onError = config.onError;
    this.vertical = config.vertical || defaultVertical;
    this.display = config.display;
    this.initSession();
    this.loadIngestedCache();

    this.api = new AkropolysAPI(
      apiUrl,
      siteId,
      apiToken,
      () => this.getShopperId(),
      () => this.sessionId,
      this.vertical
    );
    instance = this;

    if (typeof window !== 'undefined') {
      this.onlineHandler = () => {
        console.log('[Akropolys] Connectivity restored, flushing queued ingestions.');
        this.flushQueue();
      };
      window.addEventListener('online', this.onlineHandler);
    }
  }

  reRegister() {
    instance = this;
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

  destroy() {
    if (typeof window !== 'undefined' && this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
    if (this.ingestTimer) {
      clearTimeout(this.ingestTimer);
      this.ingestTimer = null;
    }
    if (instance === this) instance = null;
  }

  async queueIngest(rawProduct: RawProductInput): Promise<void> {
    const product = mapRawProduct(rawProduct);
    if (!product) return;

    const fingerprint = stableStringify(product);
    if (this.ingestedUrls.get(product.url) === fingerprint) {
      return; // already indexed in this session or today with same content — skip
    }
    this.ingestedUrls.set(product.url, fingerprint);
    this.saveIngestedCache();

    this.ingestQueue.push(product);
    this.scheduleFlush();
  }

  async queueIngestBatch(rawProducts: RawProductInput[]): Promise<void> {
    let changed = false;
    rawProducts.forEach(p => {
      const product = mapRawProduct(p);
      if (!product) return;

      const fingerprint = stableStringify(product);
      if (this.ingestedUrls.get(product.url) === fingerprint) {
        return;
      }
      this.ingestedUrls.set(product.url, fingerprint);
      this.ingestQueue.push(product);
      changed = true;
    });

    if (changed && this.ingestQueue.length > 0) {
      this.saveIngestedCache();
      this.scheduleFlush();
    }
  }

  private scheduleFlush() {
    if (this.ingestTimer) return;
    this.ingestTimer = setTimeout(() => {
      this.flushQueue();
    }, 300);
  }

  private async flushQueue() {
    this.ingestTimer = null;
    if (this.ingestQueue.length === 0) return;

    if (this.authLoading) {
      console.log('[Akropolys] Authentication is loading. Deferring ingestion flush.');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.warn('[Akropolys] Browser offline. Postponing ingestion.');
      return;
    }

    const batch = [...this.ingestQueue];
    this.ingestQueue = [];

    try {
      await this.api.ingestBatch(batch);
    } catch (e: any) {
      const akropolysError = {
        status: e.status || 500,
        message: e.message || 'Unknown network error'
      };

      if (this.onError) {
        try {
          this.onError(akropolysError);
        } catch (err) {
          console.error('[Akropolys] Error inside onError callback:', err);
        }
      }

      if (e.status && e.status >= 400 && e.status < 500) {
        console.error('[Akropolys] Ingestion discarded due to client error:', e.message);
        return;
      }

      // Re-queue and schedule another flush so items are not stuck forever
      console.warn('[Akropolys] Ingestion failed. Re-queuing to retry.', e);
      this.ingestQueue = [...batch, ...this.ingestQueue];
      this.scheduleFlush();
    }
  }
}

let instance: AkropolysClient | null = null;

export function initAkropolys(config: AkropolysConfig): AkropolysClient {
  instance = new AkropolysClient(config);
  return instance;
}

export function getAkropolysClient(): AkropolysClient {
  if (!instance) {
    const siteId = getEnvVar('NEXT_PUBLIC_HUSKEL_SITE_ID');
    const apiUrl = getEnvVar('NEXT_PUBLIC_HUSKEL_API_URL');
    const apiToken = getEnvVar('NEXT_PUBLIC_HUSKEL_API_TOKEN');

    if (siteId && apiUrl && apiToken) {
      instance = new AkropolysClient({ siteId, apiUrl, apiToken });
    } else {
      throw new Error('[Akropolys] Call initAkropolys() or set NEXT_PUBLIC_HUSKEL_* environment variables before using the client.');
    }
  }
  return instance;
}

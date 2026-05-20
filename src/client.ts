import { HuskelConfig, Product, RawProductInput } from './types';
import { HuskelAPI } from './api';

function getEnvVar(key: string): string | undefined {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as any;
    if (g.process && g.process.env) {
      return g.process.env[key];
    }
  }
  return undefined;
}

function mapRawProduct(input: RawProductInput): Product | null {
  const name = input.name || input.title || input.productName || '';
  
  let price = '';
  let priceNumeric: number | undefined = undefined;

  if (input.price !== undefined) {
    if (typeof input.price === 'number') {
      priceNumeric = input.price;
      price = String(input.price);
    } else {
      price = input.price;
      const num = parseFloat(input.price.replace(/[^0-9.]/g, ''));
      priceNumeric = isNaN(num) ? undefined : num;
    }
  }
  if (input.priceNumeric !== undefined) {
    priceNumeric = input.priceNumeric;
  }

  let url = input.url || '';
  if (!url && typeof window !== 'undefined') {
    url = window.location.href;
  }

  let slug = input.slug || input.id || input.productId || '';
  if (!slug && url) {
    slug = url.split('/').filter(Boolean).pop() || '';
  }
  if (!slug && name) {
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  let images: string[] = [];
  if (input.images) {
    images = input.images;
  } else if (input.image) {
    images = [input.image];
  } else if (input.thumbnail) {
    images = [input.thumbnail];
  }

  if (!name) {
    console.warn('[Huskel] Validation warning: Product name/title is missing. Skipping:', input);
    return null;
  }
  if (!price) {
    console.warn('[Huskel] Validation warning: Product price is missing. Skipping:', input);
    return null;
  }
  if (!url) {
    console.warn('[Huskel] Validation warning: Product URL is missing. Skipping:', input);
    return null;
  }

  return {
    name,
    price,
    url,
    brand: input.brand,
    description: input.description,
    originalPrice: input.originalPrice,
    discount: input.discount,
    currency: input.currency ?? 'KES',
    stock: input.stock,
    availability: input.availability,
    rating: input.rating,
    reviewCount: input.reviewCount,
    category: input.category,
    subCategory: input.subCategory,
    tags: input.tags,
    images: images.length > 0 ? images : undefined,
    specs: input.specs,
    priceNumeric,
    slug,
  };
}

export class HuskelClient {
  readonly api: HuskelAPI;
  private ingestQueue: Product[] = [];
  private ingestTimer: ReturnType<typeof setTimeout> | null = null;
  private ingestedUrls = new Set<string>();
  private onlineHandler: (() => void) | null = null;

  constructor(config: HuskelConfig) {
    const siteId = config.siteId || getEnvVar('NEXT_PUBLIC_HUSKEL_SITE_ID') || '';
    const apiUrl = config.apiUrl || getEnvVar('NEXT_PUBLIC_HUSKEL_API_URL') || '';
    const apiToken = config.apiToken || getEnvVar('NEXT_PUBLIC_HUSKEL_API_TOKEN') || '';

    // Runtime validation — fail loudly so misconfiguration is never silent
    if (!siteId) console.error('[Huskel] Missing siteId. Set it via <HuskelProvider siteId="..."> or NEXT_PUBLIC_HUSKEL_SITE_ID.');
    if (!apiUrl) console.error('[Huskel] Missing apiUrl. Set it via <HuskelProvider apiUrl="..."> or NEXT_PUBLIC_HUSKEL_API_URL.');
    if (!apiToken) console.error('[Huskel] Missing apiToken. Set it via <HuskelProvider apiToken="..."> or NEXT_PUBLIC_HUSKEL_API_TOKEN.');

    this.api = new HuskelAPI(apiUrl, siteId, apiToken);
    instance = this;

    if (typeof window !== 'undefined') {
      this.onlineHandler = () => {
        console.log('[Huskel] Connectivity restored, flushing queued ingestions.');
        this.flushQueue();
      };
      window.addEventListener('online', this.onlineHandler);
    }
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

    if (this.ingestedUrls.has(product.url)) {
      return;
    }
    this.ingestedUrls.add(product.url);

    this.ingestQueue.push(product);
    this.scheduleFlush();
  }

  async queueIngestBatch(rawProducts: RawProductInput[]): Promise<void> {
    rawProducts.forEach(p => {
      const product = mapRawProduct(p);
      if (!product) return;

      if (this.ingestedUrls.has(product.url)) {
        return;
      }
      this.ingestedUrls.add(product.url);
      this.ingestQueue.push(product);
    });

    if (this.ingestQueue.length > 0) {
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

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.warn('[Huskel] Browser offline. Postponing ingestion.');
      return;
    }

    const batch = [...this.ingestQueue];
    this.ingestQueue = [];

    try {
      await this.api.ingestBatch(batch);
    } catch (e: any) {
      if (e.status && e.status >= 400 && e.status < 500) {
        console.error('[Huskel] Ingestion discarded due to client error:', e.message);
        return;
      }

      // Re-queue and schedule another flush so items are not stuck forever
      console.warn('[Huskel] Ingestion failed. Re-queuing to retry.', e);
      this.ingestQueue = [...batch, ...this.ingestQueue];
      this.scheduleFlush();
    }
  }
}

let instance: HuskelClient | null = null;

export function initHuskel(config: HuskelConfig): HuskelClient {
  instance = new HuskelClient(config);
  return instance;
}

export function getHuskelClient(): HuskelClient {
  if (!instance) {
    const siteId = getEnvVar('NEXT_PUBLIC_HUSKEL_SITE_ID');
    const apiUrl = getEnvVar('NEXT_PUBLIC_HUSKEL_API_URL');
    const apiToken = getEnvVar('NEXT_PUBLIC_HUSKEL_API_TOKEN');

    if (siteId && apiUrl && apiToken) {
      instance = new HuskelClient({ siteId, apiUrl, apiToken });
    } else {
      throw new Error('[Huskel] Call initHuskel() or set NEXT_PUBLIC_HUSKEL_* environment variables before using the client.');
    }
  }
  return instance;
}

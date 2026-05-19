import { Product, SearchResponse, IngestResponse, HuskelError } from './types';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [500, 1000, 2000]; // ms

function log(level: 'info' | 'warn' | 'error', msg: string, data?: unknown) {
  const prefix = '[Huskel]';
  if (level === 'error') console.error(prefix, msg, data ?? '');
  else if (level === 'warn') console.warn(prefix, msg, data ?? '');
  else console.log(prefix, msg, data ?? '');
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export class HuskelAPI {
  constructor(
    private apiUrl: string,
    private siteId: string,
    private apiToken: string
  ) {}

  private async post<T>(path: string, body: unknown, attempt = 0): Promise<T> {
    const url = `${this.apiUrl}${path}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Huskel-Token': this.apiToken,
          'X-Huskel-Site': this.siteId,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        const err: HuskelError = { status: res.status, message: text };

        // Don't retry 4xx — developer errors
        if (res.status >= 400 && res.status < 500) {
          log('error', `${path} failed [${res.status}]`, text);
          throw err;
        }

        // Retry 5xx
        if (attempt < MAX_RETRIES - 1) {
          log('warn', `${path} [${res.status}] retrying (${attempt + 1}/${MAX_RETRIES})...`);
          await sleep(RETRY_DELAYS[attempt]);
          return this.post(path, body, attempt + 1);
        }

        log('error', `${path} failed after ${MAX_RETRIES} attempts`, err);
        throw err;
      }

      return res.json();
    } catch (e) {
      // Network error (offline, DNS, etc.)
      if ((e as HuskelError).status === undefined) {
        if (attempt < MAX_RETRIES - 1) {
          log('warn', `${path} network error, retrying (${attempt + 1}/${MAX_RETRIES})...`);
          await sleep(RETRY_DELAYS[attempt]);
          return this.post(path, body, attempt + 1);
        }
        log('error', `${path} unreachable after ${MAX_RETRIES} attempts`);
      }
      throw e;
    }
  }

  async ingest(product: Product): Promise<IngestResponse> {
    log('info', 'ingesting product', product.name);
    return this.post('/ingest', { siteId: this.siteId, product });
  }

  async ingestBatch(products: Product[]): Promise<IngestResponse> {
    log('info', `ingesting batch of ${products.length} products`);
    return this.post('/ingest/batch', { siteId: this.siteId, products });
  }

  async search(query: string, limit = 10): Promise<SearchResponse> {
    log('info', 'search query', query);
    return this.post('/search', { query, siteId: this.siteId, limit });
  }
}

import { Product, SearchResponse, IngestResponse, AkropolysError, CaptureTarget } from './types';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [500, 1000, 2000]; // ms

function log(level: 'info' | 'warn' | 'error', msg: string, data?: unknown) {
  const prefix = '[Akropolys]';
  if (level === 'error') console.error(prefix, msg, data ?? '');
  else if (level === 'warn') console.warn(prefix, msg, data ?? '');
  else console.debug(prefix, msg, data ?? '');
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// An explicit `fields` object is merged in, not nested, so its keys stay at fields.<key>.
function toEntityPayload(product: Record<string, any>): { url: string; fields: Record<string, any> } {
  const url = product.url || '';
  const fields: Record<string, any> = {};
  let explicit: Record<string, any> | undefined;

  for (const [k, v] of Object.entries(product)) {
    if (k === 'url') continue;
    if (k === 'fields' && v && typeof v === 'object' && !Array.isArray(v)) {
      explicit = v as Record<string, any>;
      continue;
    }
    fields[k] = v;
  }
  if (explicit) Object.assign(fields, explicit);

  if (!fields.image && Array.isArray(fields.images) && fields.images.length > 0) {
    fields.image = fields.images[0];
  }
  return { url, fields };
}

export class AkropolysAPI {
  constructor(
    public apiUrl: string,
    public siteId: string,
    public apiToken: string,
    private getShopperId?: () => string | undefined,
    private getSessionId?: () => string | undefined,
    public vertical?: string,
    private getDeviceId?: () => string | undefined,
    private getKikuPub?: () => string | undefined,
    private getShopperName?: () => string | undefined,
    private getCart?: () => unknown
  ) {}

  // Common request headers: auth + the shopper/session/device identity trio.
  // includeKikuPub adds the cross-site memory id, which only chat needs.
  private buildHeaders(includeKikuPub = false): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Akropolys-Token': this.apiToken,
      'X-Akropolys-Site': this.siteId,
      'X-Akropolys-Vertical': this.vertical || '',
    };
    const shopperId = this.getShopperId?.();
    if (shopperId) headers['X-Akropolys-Shopper-Id'] = shopperId;
    const sessionId = this.getSessionId?.();
    if (sessionId) headers['X-Akropolys-Session-Id'] = sessionId;
    const deviceId = this.getDeviceId?.();
    if (deviceId) headers['X-Akropolys-Device-Id'] = deviceId;
    if (includeKikuPub) {
      const kikuPub = this.getKikuPub?.();
      if (kikuPub) headers['X-Akropolys-Kiku-Pub'] = kikuPub;
    }
    return headers;
  }

  private async post<T>(path: string, body: unknown, attempt = 0, signal?: AbortSignal, keepalive?: boolean): Promise<T> {
    const url = `${this.apiUrl}${path}`;

    try {
      const headers = this.buildHeaders();

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
        // Survives page navigation — used for fire-and-forget analytics pings
        // fired right before the caller navigates away (e.g. a search result click).
        ...(keepalive ? { keepalive: true } : {}),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed.error === 'string') {
            message = parsed.error;
          }
        } catch {
          // keep original text
        }
        const err: AkropolysError = { status: res.status, message };

        // Don't retry 4xx — developer errors
        if (res.status >= 400 && res.status < 500) {
          log('error', `${path} failed [${res.status}]`, text);
          throw err;
        }

        // Retry 5xx
        if (attempt < MAX_RETRIES - 1) {
          log('warn', `${path} [${res.status}] retrying (${attempt + 1}/${MAX_RETRIES})...`);
          await sleep(RETRY_DELAYS[attempt]);
          return this.post(path, body, attempt + 1, signal, keepalive);
        }

        log('error', `${path} failed after ${MAX_RETRIES} attempts`, err);
        throw err;
      }

      return res.json();
    } catch (e) {
      // Caller aborted (debounce / cleanup / a newer query superseded this one).
      // This is expected, not a failure — never retry or log it.
      if ((e as any)?.name === 'AbortError' || signal?.aborted) {
        throw e;
      }
      // Network error (offline, DNS, etc.)
      if ((e as AkropolysError).status === undefined) {
        if (attempt < MAX_RETRIES - 1) {
          log('warn', `${path} network error, retrying (${attempt + 1}/${MAX_RETRIES})...`);
          await sleep(RETRY_DELAYS[attempt]);
          return this.post(path, body, attempt + 1, signal, keepalive);
        }
        log('error', `${path} unreachable after ${MAX_RETRIES} attempts`);
      }
      throw e;
    }
  }

  // Mint a fresh kiku key server-side. The key is the shopper's portable,
  // anonymous identity — shown ONCE; its hash is the memory namespace, so a
  // lost key means the memory it opens is lost with it.
  async mintKikuKey(): Promise<{ secret: string; publicId: string }> {
    const data = await this.post<{ secret?: string; publicId: string; key?: string }>('/shopper/kiku-key', {});
    return { secret: data.secret ?? data.key ?? '', publicId: data.publicId };
  }

  async ingest(product: Record<string, any>): Promise<IngestResponse> {
    if (product && product.envelope && product.sig) {
      log('info', 'ingesting ASEP v1 signed envelope', product.envelope.kid || '');
      return this.post('/ingest', {
        siteId: product.siteId || this.siteId,
        envelope: product.envelope,
        sig: product.sig,
      });
    }
    log('info', 'ingesting entity', product.name || product.id || product.url || '');
    const formattedEntity = toEntityPayload(product);
    return this.post('/ingest', {
      siteId: this.siteId, 
      entity: formattedEntity,
    });
  }

  async ingestBatch(products: Record<string, any>[]): Promise<IngestResponse> {
    if (products.length === 0) return { success: true, message: 'empty batch', count: 0 };
    const first = products[0];
    if (first && first.envelope && first.sig) {
      return this.ingest(first);
    }
    log('info', `ingesting batch of ${products.length} entities`);
    const formattedEntities = products.map(toEntityPayload);
    return this.post('/ingest/batch', {
      siteId: this.siteId, 
      entities: formattedEntities,
    });
  }

  async ingestContentBatch(contents: Array<{ url: string; title: string; text: string; capturedAt: number }>): Promise<IngestResponse> {
    log('info', `ingesting batch of ${contents.length} pages`);
    return this.post('/content/ingest', { siteId: this.siteId, contents });
  }

  async search(query: string, limit = 10): Promise<SearchResponse> {
    log('info', 'search query', query);
    return this.post('/search', { query, siteId: this.siteId, limit });
  }

  // Pure vector search — no LLM, instant results.
  async searchVector(query: string, limit = 10, signal?: AbortSignal, keepalive?: boolean): Promise<SearchResponse> {
    return this.post('/search/vector', { query, siteId: this.siteId, limit }, 0, signal, keepalive);
  }

  // Autocomplete — pure in-memory Trie, <1ms, no Upstash call. Only true prefix matches.
  async searchAutocomplete(query: string, limit = 8, signal?: AbortSignal): Promise<SearchResponse> {
    return this.post('/search/autocomplete', { query, siteId: this.siteId, limit }, 0, signal);
  }

  // LLM chat — conversational search with history context.
  async chat(query: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = [], currentContext?: any): Promise<{ answer: string; sources: any[]; intent?: string; action?: any }> {
    log('info', 'chat query', query);
    return this.post('/chat', { query, siteId: this.siteId, history, currentContext });
  }

  // Streaming variant — returns the raw fetch Response.
  // The caller reads body as a ReadableStream of SSE frames.
  async chatStream(
    query: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    signal?: AbortSignal,
    currentContext?: any,
    attachments?: Array<{ type: 'image'; data: string }>,
    forcedIntent?: string,
    captureTargets?: CaptureTarget[]
  ): Promise<Response> {
    log('info', 'chatStream query', query);
    const headers = this.buildHeaders(true);
    const body: Record<string, any> = { query, siteId: this.siteId, history, currentContext };
    const shopperName = this.getShopperName?.();
    if (shopperName) body.shopperName = shopperName;
    // Read-through to the developer's cart, if they exposed one. Only sent when
    // it's a non-empty array; the SDK reads what they hand back, nothing more.
    const cart = this.getCart?.();
    if (Array.isArray(cart) && cart.length > 0) body.cart = cart.slice(0, 50);
    if (attachments && attachments.length > 0) {
      body.attachments = attachments;
      if (attachments.some((a: any) => a.annotated)) body.imageAnnotated = true;
    }
    if (forcedIntent)                          body.forcedIntent = forcedIntent;
    if (captureTargets && captureTargets.length > 0) body.captureTargets = captureTargets;
    const res = await fetch(`${this.apiUrl}/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      // Surface the server's message (e.g. the guest chat limit) instead of a bare status.
      let msg = `Stream request failed: ${res.status}`;
      try {
        const parsed = JSON.parse(await res.text());
        if (parsed?.error) msg = parsed.error;
      } catch { /* keep default */ }
      throw new Error(msg);
    }
    return res;
  }

  // Visual style-match search — "find a dress that matches my shoes"
  // image: base64 data URI ("data:image/jpeg;base64,...") or public image URL
  // categoryHint: optional target category e.g. "dress", "curtains"
  async searchByImage(
    image: string,
    categoryHint?: string,
    limit = 8
  ): Promise<import('./types').VisualSearchResponse> {
    log('info', 'searchByImage', categoryHint ?? 'no hint');
    return this.post('/search/visual', {
      siteId: this.siteId,
      image,
      category_hint: categoryHint,
      limit,
    });
  }

  // Free-form visual Q&A — "what is this product?"
  async analyzeImage(
    image: string,
    query?: string
  ): Promise<{ answer: string }> {
    log('info', 'analyzeImage query', query ?? '(describe)');
    return this.post('/chat/vision', { siteId: this.siteId, image, query });
  }

  // Composite a product into the shopper's own photo. Billed per generation.
  async visualize(
    sceneImage: string,
    productImage: string,
    signal?: AbortSignal
  ): Promise<{ id: string; url: string; costUsd: number }> {
    log('info', 'visualize');
    return this.post('/visualize', {
      siteId: this.siteId,
      sceneImage,
      productImage,
    }, 0, signal);
  }
}

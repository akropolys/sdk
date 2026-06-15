import { Product, SearchResponse, IngestResponse, AkropolysError, CheckoutConfig, PaymentInitResponse, PaymentStatusResponse } from './types';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [500, 1000, 2000]; // ms

function log(level: 'info' | 'warn' | 'error', msg: string, data?: unknown) {
  const prefix = '[Akropolys]';
  if (level === 'error') console.error(prefix, msg, data ?? '');
  else if (level === 'warn') console.warn(prefix, msg, data ?? '');
  else console.log(prefix, msg, data ?? '');
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export class AkropolysAPI {
  constructor(
    public apiUrl: string,
    public siteId: string,
    public apiToken: string,
    private getShopperId?: () => string | undefined,
    private getSessionId?: () => string | undefined,
    public vertical?: string,
    private getDeviceId?: () => string | undefined
  ) {}

  private async post<T>(path: string, body: unknown, attempt = 0, signal?: AbortSignal): Promise<T> {
    const url = `${this.apiUrl}${path}`;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Akropolys-Token': this.apiToken,
        'X-Akropolys-Site': this.siteId,
      };

      const shopperId = this.getShopperId?.();
      if (shopperId) {
        headers['X-Akropolys-Shopper-Id'] = shopperId;
      }

      const sessionId = this.getSessionId?.();
      if (sessionId) {
        headers['X-Akropolys-Session-Id'] = sessionId;
      }

      const deviceId = this.getDeviceId?.();
      if (deviceId) {
        headers['X-Akropolys-Device-Id'] = deviceId;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
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
          return this.post(path, body, attempt + 1, signal);
        }

        log('error', `${path} failed after ${MAX_RETRIES} attempts`, err);
        throw err;
      }

      return res.json();
    } catch (e) {
      // Network error (offline, DNS, etc.)
      if ((e as AkropolysError).status === undefined) {
        if (attempt < MAX_RETRIES - 1) {
          log('warn', `${path} network error, retrying (${attempt + 1}/${MAX_RETRIES})...`);
          await sleep(RETRY_DELAYS[attempt]);
          return this.post(path, body, attempt + 1, signal);
        }
        log('error', `${path} unreachable after ${MAX_RETRIES} attempts`);
      }
      throw e;
    }
  }

  async ingest(product: Record<string, any>): Promise<IngestResponse> {
    log('info', 'ingesting product', product.name || product.id || '');
    const url = product.url || '';
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(product)) {
      if (k !== 'url') {
        fields[k] = v;
      }
    }
    if (!fields.image && Array.isArray(fields.images) && fields.images.length > 0) {
      fields.image = fields.images[0];
    }
    const formattedEntity = { url, fields };
    return this.post('/ingest', { 
      siteId: this.siteId, 
      entity: formattedEntity,
      product: formattedEntity 
    });
  }

  async ingestBatch(products: Record<string, any>[]): Promise<IngestResponse> {
    log('info', `ingesting batch of ${products.length} products`);
    const formattedEntities = products.map(product => {
      const url = product.url || '';
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(product)) {
        if (k !== 'url') {
          fields[k] = v;
        }
      }
      if (!fields.image && Array.isArray(fields.images) && fields.images.length > 0) {
        fields.image = fields.images[0];
      }
      return { url, fields };
    });
    return this.post('/ingest/batch', { 
      siteId: this.siteId, 
      entities: formattedEntities,
      products: formattedEntities 
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
  async searchVector(query: string, limit = 10, signal?: AbortSignal): Promise<SearchResponse> {
    return this.post('/search/vector', { query, siteId: this.siteId, limit }, 0, signal);
  }

  // Autocomplete — pure in-memory Trie, <1ms, no Upstash call. Only true prefix matches.
  async searchAutocomplete(query: string, limit = 8, signal?: AbortSignal): Promise<SearchResponse> {
    return this.post('/search/autocomplete', { query, siteId: this.siteId, limit }, 0, signal);
  }

  // LLM chat — conversational search with history context.
  async chat(query: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = [], currentContext?: any): Promise<{ answer: string; sources: any[]; intent?: string; checkout?: import('./types').CartPayload; action?: any }> {
    log('info', 'chat query', query);
    const path = !this.vertical || this.vertical === 'commerce' ? '/chat' : `/chat/${this.vertical}`;
    return this.post(path, { query, siteId: this.siteId, history, currentContext });
  }

  // Streaming variant — returns the raw fetch Response.
  // The caller reads body as a ReadableStream of SSE frames.
  async chatStream(query: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = [], signal?: AbortSignal, currentContext?: any, attachments?: Array<{ type: 'image'; data: string }>): Promise<Response> {
    log('info', 'chatStream query', query);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Akropolys-Token': this.apiToken,
      'X-Akropolys-Site': this.siteId,
    };
    const shopperId = this.getShopperId?.();
    if (shopperId) headers['X-Akropolys-Shopper-Id'] = shopperId;
    const sessionId = this.getSessionId?.();
    if (sessionId) headers['X-Akropolys-Session-Id'] = sessionId;
    const deviceId = this.getDeviceId?.();
    if (deviceId) headers['X-Akropolys-Device-Id'] = deviceId;
    const path = !this.vertical || this.vertical === 'commerce' ? '/chat/stream' : `/chat/stream/${this.vertical}`;
    const body: Record<string, any> = { query, siteId: this.siteId, history, currentContext };
    if (attachments && attachments.length > 0) body.attachments = attachments;
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`Stream request failed: ${res.status}`);
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

  // --- Cart System ---
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Akropolys-Token': this.apiToken,
      'X-Akropolys-Site': this.siteId,
    };
    const shopperId = this.getShopperId?.();
    if (shopperId) headers['X-Akropolys-Shopper-Id'] = shopperId;
    const sessionId = this.getSessionId?.();
    if (sessionId) headers['X-Akropolys-Session-Id'] = sessionId;
    const deviceId = this.getDeviceId?.();
    if (deviceId) headers['X-Akropolys-Device-Id'] = deviceId;
    if (typeof window !== 'undefined') {
      // Phone is only needed for M-Pesa checkout — not for Kiku device identity
      const phone = localStorage.getItem('akropolys_user_phone');
      if (phone) {
        headers['X-Akropolys-Shopper-Phone'] = phone;
      }
    }
    return headers;
  }

  async getCart(): Promise<import('./types').CartPayload> {
    const res = await fetch(`${this.apiUrl}/cart?siteId=${this.siteId}`, {
      headers: this.buildHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch cart');
    return res.json();
  }

  async clearCart(): Promise<import('./types').CartPayload> {
    const res = await fetch(`${this.apiUrl}/cart?siteId=${this.siteId}`, {
      method: 'DELETE',
      headers: this.buildHeaders()
    });
    if (!res.ok) throw new Error('Failed to clear cart');
    return res.json();
  }

  async checkoutCart(): Promise<import('./types').CartPayload> {
    const res = await fetch(`${this.apiUrl}/cart/checkout`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ siteId: this.siteId })
    });
    if (!res.ok) throw new Error('Failed to checkout cart');
    return res.json();
  }

  async getCheckoutConfig(): Promise<CheckoutConfig> {
    const res = await fetch(`${this.apiUrl}/checkout/config?site_id=${this.siteId}`, {
      method: 'GET',
      headers: this.buildHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch checkout config');
    return res.json();
  }

  async initiatePayment(phoneNumber: string, email?: string, firstName?: string, lastName?: string): Promise<PaymentInitResponse> {
    const res = await fetch(`${this.apiUrl}/payment/initiate`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        siteId: this.siteId,
        phoneNumber,
        email,
        firstName,
        lastName
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('Failed to initiate payment: ' + errText);
    }
    return res.json();
  }

  async getPaymentStatus(ref: string): Promise<PaymentStatusResponse> {
    const res = await fetch(`${this.apiUrl}/payment/status?ref=${ref}`, {
      method: 'GET',
      headers: this.buildHeaders()
    });
    if (!res.ok) throw new Error('Failed to get payment status');
    return res.json();
  }
}

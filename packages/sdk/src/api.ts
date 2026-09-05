import {
  Product,
  SearchResponse,
  IngestResponse,
  AkropolysError,
  CaptureTarget,
  Scout,
  ScoutEvent,
  CreateScoutInput,
  ListScoutsResponse,
  GetScoutResponse,
  ScoutActionResponse,
} from './types';

export interface UIStrings {
  strings: Record<string, string>;
  complete: boolean;

  curated: boolean;
  dir: 'ltr' | 'rtl';

  bcp47: string;

  font: ScriptFont | null;
}

export type VoiceRefusal = 'guest' | 'shopper' | 'site' | 'credits' | 'unavailable';

export type SpeechResult =
  | { audio: ArrayBuffer; mime: string; secondsLeft?: number; refused?: undefined }
  | { refused: VoiceRefusal };

export interface ScriptFont {
  family: string;

  faces: { url: string; unicodeRange: string; weight: string }[];
}

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
    private getCart?: () => unknown,
    private getShopperLanguage?: () => string | undefined,
    private getEntityLanguageMode?: () => string | undefined,
    private getKikuKey?: () => string | undefined
  ) {}

  async entityPreview(language: string): Promise<{ original?: any; translated?: any } | null> {
    try {
      const res = await fetch(`${this.apiUrl}/entity-preview`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({ siteId: this.siteId, language }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private parseFont(raw: unknown): ScriptFont | null {
    const f = raw as { family?: unknown; faces?: unknown } | null | undefined;
    if (!f || typeof f.family !== 'string' || !f.family.trim()) return null;
    if (!Array.isArray(f.faces)) return null;

    let base: URL;
    try {
      base = new URL(this.apiUrl, typeof location !== 'undefined' ? location.href : undefined);
    } catch {
      return null;
    }

    const faces: ScriptFont['faces'] = [];
    for (const raw of f.faces) {
      const fc = raw as { url?: unknown; unicodeRange?: unknown; weight?: unknown };
      if (typeof fc?.url !== 'string' || !fc.url.startsWith('/')) continue;
      try {
        const url = new URL(this.apiUrl.replace(/\/+$/, '') + fc.url);
        if (url.origin !== base.origin) continue;
        faces.push({
          url: url.href,
          unicodeRange: typeof fc.unicodeRange === 'string' ? fc.unicodeRange : '',
          weight: typeof fc.weight === 'string' && fc.weight ? fc.weight : '400',
        });
      } catch { /* skip */ }
    }
    return faces.length > 0 ? { family: f.family, faces } : null;
  }

  async baseFont(): Promise<ScriptFont | null> {
    try {
      const res = await fetch(`${this.apiUrl}/fonts/v1/base`, {
        method: 'GET',
        headers: this.buildHeaders(),
      });
      if (!res.ok) return null;
      return this.parseFont(await res.json());
    } catch {
      return null;
    }
  }

  async uiStrings(language: string): Promise<UIStrings | null> {
    try {
      const res = await fetch(`${this.apiUrl}/ui-strings`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({ siteId: this.siteId, language }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.strings) return null;
      return {
        strings: data.strings,
        complete: data.complete !== false,
        curated: data.curated === true,
        dir: data.dir === 'rtl' ? 'rtl' : 'ltr',
        bcp47: typeof data.bcp47 === 'string' ? data.bcp47 : '',
        font: this.parseFont(data.font),
      };
    } catch {
      return null;
    }
  }

  async getVideoStatus(jobId: string): Promise<
    { status: 'PENDING' | 'SUCCESS' | 'FAILED'; videoUrl?: string; error?: string } | null
  > {
    try {
      const url = `${this.apiUrl}/visualize/video/${encodeURIComponent(jobId)}?siteId=${encodeURIComponent(this.siteId)}`;
      const res = await fetch(url, { method: 'GET', headers: this.buildHeaders() });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private buildHeaders(includeKikuPub = false, extraHeaders?: Record<string, string>): Record<string, string> {
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
    const kikuKey = this.getKikuKey?.();
    if (kikuKey) {
      headers['X-Akropolys-Kiku-Key'] = kikuKey;
    }
    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }
    return headers;
  }

  private async post<T>(path: string, body: unknown, attempt = 0, signal?: AbortSignal, keepalive?: boolean, extraHeaders?: Record<string, string>): Promise<T> {
    const url = `${this.apiUrl}${path}`;

    try {
      const headers = this.buildHeaders(false, extraHeaders);

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
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
        }
        const err: AkropolysError = { status: res.status, message };

        if (res.status >= 400 && res.status < 500) {
          log('error', `${path} failed [${res.status}]`, text);
          throw err;
        }

        if (attempt < MAX_RETRIES - 1) {
          log('warn', `${path} [${res.status}] retrying (${attempt + 1}/${MAX_RETRIES})...`);
          await sleep(RETRY_DELAYS[attempt]);
          return this.post(path, body, attempt + 1, signal, keepalive, extraHeaders);
        }

        log('error', `${path} failed after ${MAX_RETRIES} attempts`, err);
        throw err;
      }

      return res.json();
    } catch (e) {
      if ((e as any)?.name === 'AbortError' || signal?.aborted) {
        throw e;
      }
      if ((e as AkropolysError).status === undefined) {
        if (attempt < MAX_RETRIES - 1) {
          log('warn', `${path} network error, retrying (${attempt + 1}/${MAX_RETRIES})...`);
          await sleep(RETRY_DELAYS[attempt]);
          return this.post(path, body, attempt + 1, signal, keepalive, extraHeaders);
        }
        log('error', `${path} unreachable after ${MAX_RETRIES} attempts`);
      }
      throw e;
    }
  }

  private async get<T>(path: string, extraHeaders?: Record<string, string>, signal?: AbortSignal): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    try {
      const headers = this.buildHeaders(false, extraHeaders);
      const res = await fetch(url, { method: 'GET', headers, signal });
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed.error === 'string') message = parsed.error;
        } catch {}
        throw { status: res.status, message } as AkropolysError;
      }
      return res.json();
    } catch (e) {
      if ((e as any)?.name === 'AbortError' || signal?.aborted) throw e;
      throw e;
    }
  }

  private async del<T>(path: string, extraHeaders?: Record<string, string>, signal?: AbortSignal): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    try {
      const headers = this.buildHeaders(false, extraHeaders);
      const res = await fetch(url, { method: 'DELETE', headers, signal });
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed.error === 'string') message = parsed.error;
        } catch {}
        throw { status: res.status, message } as AkropolysError;
      }
      return res.json();
    } catch (e) {
      if ((e as any)?.name === 'AbortError' || signal?.aborted) throw e;
      throw e;
    }
  }

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

  async searchVector(query: string, limit = 10, signal?: AbortSignal, keepalive?: boolean): Promise<SearchResponse> {
    return this.post('/search/vector', { query, siteId: this.siteId, limit }, 0, signal, keepalive);
  }

  async searchAutocomplete(query: string, limit = 8, signal?: AbortSignal): Promise<SearchResponse> {
    return this.post('/search/autocomplete', { query, siteId: this.siteId, limit }, 0, signal);
  }

  async chat(query: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = [], currentContext?: any): Promise<{ answer: string; sources: any[]; intent?: string; action?: any }> {
    log('info', 'chat query', query);
    return this.post('/chat', { query, siteId: this.siteId, history, currentContext });
  }

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
    const shopperLanguage = this.getShopperLanguage?.();
    if (shopperLanguage) body.shopperLanguage = shopperLanguage;
    const entityLanguageMode = this.getEntityLanguageMode?.();
    if (entityLanguageMode) body.entityLanguageMode = entityLanguageMode;
    const cart = this.getCart?.();
    if (Array.isArray(cart) && cart.length > 0) body.cart = cart.slice(0, 50);
    if (attachments && attachments.length > 0) {
      body.attachments = attachments.map(({ preview, ...a }: any) => a);
      if (attachments.some((a: any) => a.annotated)) body.imageAnnotated = true;
      if (attachments.some((a: any) => a.instructed)) body.imageInstructed = true;
      const marks = attachments.flatMap((a: any) => (Array.isArray(a.marks) ? a.marks : []));
      if (marks.length > 0) body.imageMarks = marks;
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
      let msg = `Stream request failed: ${res.status}`;
      try {
        const parsed = JSON.parse(await res.text());
        if (parsed?.error) msg = parsed.error;
      } catch { /* keep default */ }
      throw new Error(msg);
    }
    return res;
  }

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

  async analyzeImage(
    image: string,
    query?: string
  ): Promise<{ answer: string }> {
    log('info', 'analyzeImage query', query ?? '(describe)');
    return this.post('/chat/vision', { siteId: this.siteId, image, query });
  }

  async synthesizeSpeech(
    text: string,
    voice?: string,
    language?: string,
    signal?: AbortSignal
  ): Promise<SpeechResult | null> {
    try {
      const res = await fetch(`${this.apiUrl}/speech`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({ siteId: this.siteId, text, voice, language }),
        signal,
      });
      if (!res.ok) {
        log('warn', `speech failed [${res.status}]`, await res.text().catch(() => ''));
        const refused = res.headers.get('X-Akropolys-Voice-Refused');
        return refused ? { refused: refused as VoiceRefusal } : null;
      }
      const left = res.headers.get('X-Akropolys-Voice-Seconds-Left');
      return {
        audio: await res.arrayBuffer(),
        mime: res.headers.get('Content-Type') || 'audio/wav',
        secondsLeft: left === null ? undefined : Number(left),
      };
    } catch {
      return null;
    }
  }

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

  async createScout(input: CreateScoutInput, signal?: AbortSignal): Promise<Scout> {
    log('info', 'createScout', input.instrument);
    const siteId = input.siteId || this.siteId;
    const extraHeaders: Record<string, string> = {};
    if (input.kikuKey) {
      extraHeaders['X-Akropolys-Kiku-Key'] = input.kikuKey;
    }
    const body: Record<string, any> = {
      siteId,
      name: input.name,
      instrument: input.instrument,
      conditionField: input.conditionField || 'price',
      operator: input.operator || '<=',
      targetValue: input.targetValue,
      actionType: input.actionType || 'alert',
      durationMinutes: input.durationMinutes ?? 60,
      initialValue: input.initialValue,
    };
    if (input.kikuKey) body.kikuKey = input.kikuKey;
    const res = await this.post<{ scout: Scout }>('/scouts', body, 0, signal, false, extraHeaders);
    return res.scout;
  }

  async listScouts(filter?: { siteId?: string; status?: string; kikuKey?: string }, signal?: AbortSignal): Promise<ListScoutsResponse> {
    log('info', 'listScouts', filter?.status ?? 'all');
    const siteId = filter?.siteId || this.siteId;
    const params = new URLSearchParams();
    if (siteId) params.set('siteId', siteId);
    if (filter?.status) params.set('status', filter.status);
    if (filter?.kikuKey) params.set('kikuKey', filter.kikuKey);
    const extraHeaders: Record<string, string> = {};
    if (filter?.kikuKey) extraHeaders['X-Akropolys-Kiku-Key'] = filter.kikuKey;
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.get<ListScoutsResponse>(`/scouts${qs}`, extraHeaders, signal);
  }

  async getScout(id: string, kikuKey?: string, signal?: AbortSignal): Promise<GetScoutResponse> {
    log('info', 'getScout', id);
    const params = new URLSearchParams();
    if (kikuKey) params.set('kikuKey', kikuKey);
    const extraHeaders: Record<string, string> = {};
    if (kikuKey) extraHeaders['X-Akropolys-Kiku-Key'] = kikuKey;
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.get<GetScoutResponse>(`/scouts/${encodeURIComponent(id)}${qs}`, extraHeaders, signal);
  }

  async pauseScout(id: string, kikuKey?: string, signal?: AbortSignal): Promise<ScoutActionResponse> {
    log('info', 'pauseScout', id);
    const extraHeaders: Record<string, string> = {};
    if (kikuKey) extraHeaders['X-Akropolys-Kiku-Key'] = kikuKey;
    return this.post<ScoutActionResponse>(`/scouts/${encodeURIComponent(id)}/pause`, {}, 0, signal, false, extraHeaders);
  }

  async resumeScout(id: string, kikuKey?: string, signal?: AbortSignal): Promise<ScoutActionResponse> {
    log('info', 'resumeScout', id);
    const extraHeaders: Record<string, string> = {};
    if (kikuKey) extraHeaders['X-Akropolys-Kiku-Key'] = kikuKey;
    return this.post<ScoutActionResponse>(`/scouts/${encodeURIComponent(id)}/resume`, {}, 0, signal, false, extraHeaders);
  }

  async cancelScout(id: string, kikuKey?: string, signal?: AbortSignal): Promise<ScoutActionResponse> {
    log('info', 'cancelScout', id);
    const extraHeaders: Record<string, string> = {};
    if (kikuKey) extraHeaders['X-Akropolys-Kiku-Key'] = kikuKey;
    return this.del<ScoutActionResponse>(`/scouts/${encodeURIComponent(id)}`, extraHeaders, signal);
  }
}

import {
  Product,
  SearchResponse,
  IngestResponse,
  AkropolysError,
  CaptureTarget,
  ChatAttachment,
} from './types';
import { executeBrowserAction, type ActionHeaders, type BrowserActionRequest, type BrowserActionResult } from './browserActions';
import type { ActionAuth } from './actionAuth';
import { normalizeIngestRecord, recordID, ingestionEntity } from './ingestionRecord';
import { loadConversation, saveConversation, listenConversation, type HumanConversation, type ConversationEvent, type VisitorRequest } from './conversation';

export interface UIStrings {
  strings: Record<string, string>;
  complete: boolean;
  dir: 'ltr' | 'rtl';

  bcp47: string;

  font: ScriptFont | null;
}

export interface WidgetSettings {
  identityUrl: string;
  cardFields: string[];
  detectedLanguage?: string;
  font?: ScriptFont | null;
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

function toEntityPayload(product: Record<string, any>): Record<string, any> {
  product = normalizeIngestRecord(product);
  const core: Record<string, any> = {};
  const reserved = new Set(['id', 'title', 'image', 'images', 'content', 'expiresAt']);
  const fields: Record<string, any> = {};
  let explicit: Record<string, any> | undefined;

  for (const [k, v] of Object.entries(product)) {
    if (k === 'url') continue;
    if (reserved.has(k)) { core[k] = v; continue; }
    if (k === 'fields' && v && typeof v === 'object' && !Array.isArray(v)) {
      explicit = v as Record<string, any>;
      continue;
    }
    fields[k] = v;
  }
  if (explicit) Object.assign(fields, explicit);

  if (!fields.image && Array.isArray(fields.images) && fields.images.length > 0) {
    const first = fields.images[0];
    fields.image = typeof first === 'string' ? first : first?.url;
  }
  return { ...core, fields };
}

export class AkropolysAPI {
  userProof?: string;
  actionHeaders?: ActionHeaders;
  actionAuth?: ActionAuth;

  executeBrowserAction(request: BrowserActionRequest, signal?: AbortSignal): Promise<BrowserActionResult> {
    return executeBrowserAction(request, signal, this.actionHeaders, this.actionAuth);
  }

  async handleBrowserAction(request: BrowserActionRequest, signal?: AbortSignal): Promise<void> {
    if (!request.id || !/^[a-f0-9]{64}$/.test(request.id)) throw new Error("Invalid action request.");
    const result = await this.executeBrowserAction(request, signal);
    if (signal?.aborted) return;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 5000);
    try {
      const response = await fetch(`${this.apiUrl}/chat/actions/${request.id}/result`, {
        method: "POST", headers: this.buildHeaders(), credentials: "omit",
        body: JSON.stringify({ siteId: this.siteId, result }), signal: controller.signal,
      });
      if (!response.ok) throw new Error("Could not return the action result. Check the site before retrying.");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  constructor(
    public apiUrl: string,
    public siteId: string,
    public apiToken: string,
    private getShopperId?: () => string | undefined,
    private getSessionId?: () => string | undefined,
    private getDeviceId?: () => string | undefined,
    private getKikuPub?: () => string | undefined,
    private getShopperName?: () => string | undefined,
    private getShopperLanguage?: () => string | undefined,
    private getEntityLanguageMode?: () => string | undefined,
    private getKikuKey?: () => string | undefined
  ) {}

  private widget?: Promise<WidgetSettings>;

  private humanConversation?: HumanConversation | null;

  // The conversation a person was asked into, if any; remembered across reloads.
  get conversation(): HumanConversation | null {
    if (this.humanConversation === undefined) this.humanConversation = loadConversation(this.siteId);
    return this.humanConversation;
  }

  // A reopened request keeps its token: the server only returns one when the conversation is new.
  openConversation(id: string, token?: string): void {
    const current = this.conversation;
    const same = current?.id === id;
    const next = { id, token: token || (same ? current!.token : ''), cursor: same ? current!.cursor : 0 };
    this.humanConversation = next.token ? next : null;
    saveConversation(this.siteId, this.humanConversation);
  }

  seenConversationMessage(id: number): void {
    const c = this.conversation;
    if (!c || id <= c.cursor) return;
    this.humanConversation = { ...c, cursor: id };
    saveConversation(this.siteId, this.humanConversation);
  }

  // The visitor's requests on this site, found by their Kiku identity; empty for a visitor without one.
  async myRequests(): Promise<VisitorRequest[]> {
    if (!this.getKikuKey?.()) return [];
    const res = await fetch(`${this.apiUrl}/conversations?siteId=${encodeURIComponent(this.siteId)}`, { headers: this.buildHeaders() });
    if (!res.ok) return [];
    return (await res.json()).requests ?? [];
  }

  // Picks a request up again in this browser; resolves with its last message id, or null when it is not theirs.
  async resumeRequest(id: string): Promise<number | null> {
    const url = `${this.apiUrl}/conversations/${encodeURIComponent(id)}/resume?siteId=${encodeURIComponent(this.siteId)}`;
    const res = await fetch(url, { method: 'POST', headers: this.buildHeaders() });
    if (!res.ok) return null;
    const body = await res.json();
    this.humanConversation = { id, token: body.token, cursor: 0 };
    saveConversation(this.siteId, this.humanConversation);
    return Number(body.lastMessageId) || 0;
  }

  // Replies from the team the visitor has not seen yet, for the badge on the closed launcher.
  async unreadFromTeam(): Promise<number> {
    return (await this.conversationState())?.unread ?? 0;
  }

  // Where the remembered request stands: its status, and the team's replies not yet seen.
  async conversationState(): Promise<{ status: string; unread: number } | null> {
    const c = this.conversation;
    if (!c) return null;
    const url = `${this.apiUrl}/conversations/${encodeURIComponent(c.id)}?siteId=${encodeURIComponent(this.siteId)}&after=${c.cursor}`;
    const res = await fetch(url, { headers: this.buildHeaders(false, { 'X-Akropolys-Conversation-Token': c.token }) });
    if (!res.ok) return null;
    const body = await res.json();
    const messages: { role: string }[] = body.messages ?? [];
    return { status: body.status, unread: messages.filter(m => m.role === 'human').length };
  }

  // The visitor ended the request: the team is told, and this browser forgets it.
  leaveConversation(): void {
    const c = this.conversation;
    if (!c) return;
    this.forgetConversation();
    const url = `${this.apiUrl}/conversations/${encodeURIComponent(c.id)}/leave?siteId=${encodeURIComponent(this.siteId)}`;
    fetch(url, { method: 'POST', headers: this.buildHeaders(false, { 'X-Akropolys-Conversation-Token': c.token }), keepalive: true }).catch(() => {});
  }

  forgetConversation(): void {
    this.humanConversation = null;
    saveConversation(this.siteId, null);
  }

  // One connection to the conversation's replies, from the last message seen; resolves with the HTTP status.
  conversationEvents(onEvent: (e: ConversationEvent) => void, signal: AbortSignal, after?: number): Promise<number> {
    const c = this.conversation;
    if (!c) return Promise.resolve(404);
    const url = `${this.apiUrl}/conversations/${encodeURIComponent(c.id)}/events?siteId=${encodeURIComponent(this.siteId)}&after=${after ?? c.cursor}`;
    return listenConversation(url, this.buildHeaders(false, { 'X-Akropolys-Conversation-Token': c.token }), onEvent, signal);
  }

  // Last known card fields; components read them through useCardFields so they re-render when they arrive.
  cardFields: string[] = [];

  // One boot call: the site's identity address, language and font.
  widgetSettings(): Promise<WidgetSettings> {
    if (!this.widget) {
      this.widget = (async () => {
        try {
          const res = await fetch(`${this.apiUrl}/site-widget?siteId=${encodeURIComponent(this.siteId)}`);
          if (!res.ok) throw new Error(`site-widget ${res.status}`);
          const data = await res.json();
          this.cardFields = Array.isArray(data?.cardFields) ? data.cardFields.filter((f: unknown) => typeof f === 'string') : [];
          return {
            identityUrl: data?.identityUrl || '',
            cardFields: this.cardFields,
            detectedLanguage: typeof data?.detectedLanguage === 'string' ? data.detectedLanguage : undefined,
            font: data?.font ? this.parseFont(data.font) : null,
          };
        } catch {
          this.widget = undefined; // next caller retries
          return { identityUrl: '', cardFields: this.cardFields };
        }
      })();
    }
    return this.widget;
  }

  async getShopperAuth(signal?: AbortSignal): Promise<string | undefined> {
    const { identityUrl } = await this.widgetSettings();
    if (!identityUrl) return undefined;
    try {
      const res = await fetch(identityUrl, {
        signal,
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return undefined;
      const data = await res.json();
      const value = data?.authorization || data?.token;
      if (typeof value !== 'string' || !value) return undefined;
      return data?.authorization ? value : `Bearer ${value}`;
    } catch {
      return undefined;
    }
  }

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

  // Parks a photo as this session's working scene, so the voice model can edit it.
  async storeScene(image: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/scene`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({ siteId: this.siteId, image }),
      });
      return res.ok;
    } catch {
      return false;
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

  // defaults ride along so a new widget string is translated without a server release
  async uiStrings(language: string, defaults?: Record<string, string>): Promise<UIStrings | null> {
    try {
      const res = await fetch(`${this.apiUrl}/ui-strings`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({ siteId: this.siteId, language, defaults }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.strings) return null;
      return {
        strings: data.strings,
        complete: data.complete !== false,
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

  // the kiku pub outranks the host's shopperId, or minutes held under one id are read under another
  private buildHeaders(_legacy?: boolean, extraHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Akropolys-Token': this.apiToken,
      'X-Akropolys-Site': this.siteId,
    };
    const shopperId = this.getShopperId?.();
    if (shopperId) headers['X-Akropolys-Shopper-Id'] = shopperId;
    if (this.userProof) headers['X-Akropolys-Shopper-Proof'] = this.userProof;
    const sessionId = this.getSessionId?.();
    if (sessionId) headers['X-Akropolys-Session-Id'] = sessionId;
    const deviceId = this.getDeviceId?.();
    if (deviceId) headers['X-Akropolys-Device-Id'] = deviceId;
    const kikuPub = this.getKikuPub?.();
    if (kikuPub) headers['X-Akropolys-Kiku-Pub'] = kikuPub;
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

  async mintKikuKey(): Promise<{ secret: string; publicId: string }> {
    const data = await this.post<{ secret?: string; publicId: string; key?: string }>('/shopper/kiku-key', {});
    return { secret: data.secret ?? data.key ?? '', publicId: data.publicId };
  }

  async ingest(product: Record<string, any>): Promise<IngestResponse> {
    recordID(ingestionEntity(product));
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
    // Avoid partial writes when a later record has no stable ID.
    products.forEach(p => recordID(ingestionEntity(p)));
    if (products.some(p => p?.envelope && p?.sig)) {
      // Each signature belongs to its own envelope; do not drop later entities.
      let count = 0, queued = 0;
      for (const product of products) {
        const result = await this.ingest(product);
        if (!result.success) return { ...result, count, queued: queued + (result.queued ?? 0) };
        queued += result.queued ?? 0;
        count++;
      }
      return { success: true, count, queued, ...(queued > 0 ? { code: 'reindex_queued' as const } : {}), message: queued > 0 ? 'Updates queued for re-indexing' : 'batch ingested' };
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
    attachments?: ChatAttachment[],
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
    if (attachments && attachments.length > 0) {
      body.attachments = attachments.map(({ preview, ...a }: any) => a);
      if (attachments.some((a: any) => a.annotated)) body.imageAnnotated = true;
      const marked = attachments.find((a: any) => a.annotated && typeof a.preview === 'string');
      if (marked) body.imageGuide = marked.preview;
      if (attachments.some((a: any) => a.instructed)) body.imageInstructed = true;
      const marks = attachments.flatMap((a: any) => (Array.isArray(a.marks) ? a.marks : []));
      if (marks.length > 0) body.imageMarks = marks;
    }
    const conversation = this.conversation;
    if (conversation) {
      body.conversationId = conversation.id;
      body.conversationToken = conversation.token;
    }
    if (forcedIntent)                          body.forcedIntent = forcedIntent;
    if (captureTargets && captureTargets.length > 0) body.captureTargets = captureTargets;
    body.browserActions = typeof window !== 'undefined';
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

  async allowance(siteId?: string, signal?: AbortSignal): Promise<{ images: number; videos: number; voiceSeconds: number; replies: number }> {
    const params = new URLSearchParams();
    if (siteId || this.siteId) params.set('siteId', siteId || this.siteId);
    const res = await this.get<{ images: number; videos: number; voiceSeconds: number; replies: number }>(`/visualize/allowance?${params.toString()}`, {}, signal);
    return { images: res.images ?? -1, videos: res.videos ?? -1, voiceSeconds: res.voiceSeconds ?? -1, replies: res.replies ?? -1 };
  }
}

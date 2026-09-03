import { ChatAction } from './types';

export interface KnowledgeImage {
  url: string;
  note?: string;
  caption?: string;
}

export interface KnowledgeImageRef {
  entryId: string;
  title?: string;
  images: KnowledgeImage[];
}

export interface StaleNotice {
  title: string;
  state: 'removed' | 'unavailable';
  reason?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 data URLs attached by the user
  knowledgeImages?: KnowledgeImageRef[]; // owner-authored reference images backing this answer
  staleNotices?: StaleNotice[]; // entries referenced here that are no longer available

  liveKeys?: string[];
  actionType?: string;
  sources?: ChatSource[]; // this turn's candidate entities, for rendering referenced products
  referencedIds?: string[]; // ids from `sources` this specific answer actually mentioned
  intent?: string;
  visualization?: string; // generated product-in-scene image URL
  visualizing?: boolean; // true while the visualization is being generated
  visualizationType?: 'image' | 'video';
  visualizingText?: string;
  thinking?: string; // the model's reasoning, delivered separately from the answer
  thoughtForSeconds?: number; // wall-clock time from send until the answer began
  statusMessage?: string; // live status update (e.g. "Searching 2,431 products...")

  queued?: boolean;

  spoken?: boolean;
}

export interface ChatSource {
  id?: string;
  url?: string;
  fields?: Record<string, any>;
  name: string;
  price?: string;
  currency?: string;
  category?: string;
  image?: string;
  brand?: string;
  availability?: string;
}

export interface ChatMetadata {
  intent: string;
  sources: ChatSource[];
  action?: ChatAction;

  language?: string;

  allowedActions?: string[];
}

export type VizEvent =
  | { status: 'generating' }
  | { status: 'generating_video' }
  | { status: 'pending'; jobId: string }
  | { status: 'done'; url: string; id: string; mediaType?: 'image' | 'video' }
  | { status: 'failed'; reason?: string };

interface SSEFrame {
  event: string;
  data: string;
}

function parseSSEChunk(raw: string): SSEFrame[] {
  const frames: SSEFrame[] = [];
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = '';
    let data = '';
    let seenData = false;
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        let d = line.slice(5);
        if (d.startsWith(' ')) d = d.slice(1);
        data = seenData ? data + '\n' + d : d;
        seenData = true;
      }
    }
    if (seenData || event !== '') frames.push({ event, data });
  }
  return frames;
}

export class KikuStream {
  private listeners: Record<string, Function[]> = {};
  private aborted = false;
  private responsePromise: Promise<Response>;
  private abortController: AbortController;

  constructor(responsePromise: Promise<Response>, abortController: AbortController) {
    this.responsePromise = responsePromise;
    this.abortController = abortController;
    this.startReading();
  }

  on(event: 'token' | 'meta' | 'done' | 'error' | 'entity_ref' | 'live_ref' | 'viz' | 'thinking' | 'knowledge_images' | 'stale_notice', callback: Function): this {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }

  off(event: 'token' | 'meta' | 'done' | 'error' | 'entity_ref' | 'live_ref' | 'viz' | 'thinking' | 'knowledge_images' | 'stale_notice', callback: Function): this {
    if (!this.listeners[event]) return this;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    return this;
  }

  destroy() {
    this.aborted = true;
    this.abortController.abort();
  }

  private emit(event: string, ...args: any[]) {
    const list = this.listeners[event];
    if (!list) return;
    for (const cb of list) {
      try {
        cb(...args);
      } catch (err) {
        console.error(`[Akropolys] Error in KikuStream event listener for "${event}":`, err);
      }
    }
  }

  private async startReading() {
    let success = false;
    let finalMessage = '';
    try {
      const response = await this.responsePromise;
      if (this.aborted) return;

      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        let code: string | undefined;
        try {
          const body = await response.text();
          try {
            const parsed = JSON.parse(body);
            msg = parsed.error || parsed.message || body;
            code = parsed.code;
          } catch {
            msg = body.trim() || msg;
          }
        } catch {  }
        const err = new Error(msg);
        (err as any).status = response.status;
        if (response.status === 401) {
          (err as any).code = 'UNAUTHORIZED';
        } else if (response.status === 402 || response.status === 429) {
          (err as any).code = 'RATE_LIMIT_EXCEEDED';
        } else if (response.status === 403) {
          (err as any).code = 'FORBIDDEN';
        }
        if (code) (err as any).code = code;
        this.emit('error', err);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      try {
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedMessage = '';

        let isDoneEvent = false;
          let ended = false;
          while (!ended) {
            const { done, value } = await reader.read();
            if (this.aborted || isDoneEvent) break;

            if (done) {
              buffer += decoder.decode();
              ended = true;
            } else {
              buffer += decoder.decode(value, { stream: true });
            }

            let complete: string;
            if (ended) {
              complete = buffer;
              buffer = '';
            } else {
              const lastLf = buffer.lastIndexOf('\n\n');
              const lastCrlf = buffer.lastIndexOf('\r\n\r\n');
              const lastBoundary = Math.max(lastLf, lastCrlf);
              if (lastBoundary === -1) continue;
              const boundaryLen = lastBoundary === lastCrlf ? 4 : 2;
              complete = buffer.slice(0, lastBoundary + boundaryLen);
              buffer = buffer.slice(lastBoundary + boundaryLen);
            }

            const frames = parseSSEChunk(complete);

            for (const { event, data } of frames) {
              if (this.aborted) return;

              if (event === 'meta') {
                try {
                  const meta: ChatMetadata = JSON.parse(data);
                  this.emit('meta', meta);
                } catch {
                }
                continue;
              }

              if (event === 'entity_ref') {
                try {
                  const ref = JSON.parse(data);
                  this.emit('entity_ref', ref);
                } catch {
                }
                continue;
              }

              if (event === 'live_ref') {
                try {
                  const ref = JSON.parse(data);
                  if (ref && typeof ref.key === 'string' && ref.key) {
                    this.emit('live_ref', ref);
                  }
                } catch {
                }
                continue;
              }

              if (event === 'knowledge_images') {
                try {
                  const payload = JSON.parse(data);
                  if (Array.isArray(payload?.refs) && payload.refs.length > 0) {
                    this.emit('knowledge_images', payload.refs as KnowledgeImageRef[]);
                  }
                } catch {
                }
                continue;
              }

              if (event === 'stale_notice') {
                try {
                  const payload = JSON.parse(data);
                  if (Array.isArray(payload?.items) && payload.items.length > 0) {
                    this.emit('stale_notice', payload.items as StaleNotice[]);
                  }
                } catch {
                }
                continue;
              }

              if (event === 'thinking') {
                try {
                  const { text } = JSON.parse(data);
                  if (text) this.emit('thinking', text);
                } catch {
                }
                continue;
              }

              if (event === 'status') {
                try {
                  const status = JSON.parse(data);
                  this.emit('status', status);
                } catch {
                }
                continue;
              }

              if (event === 'viz') {
                try {
                  const viz: VizEvent = JSON.parse(data);
                  this.emit('viz', viz);
                } catch {
                }
                continue;
              }

              if (event === 'done') {
                isDoneEvent = true;
                break;
              }

              if (event === 'error') {
                let msg = 'Stream error';
                let code: string | undefined;
                try {
                  const parsed = JSON.parse(data);
                  msg = parsed.error ?? msg;
                  code = parsed.code;
                } catch {
                  msg = data;
                }
                const err = new Error(msg);
                if (code) (err as Error & { code?: string }).code = code;
                throw err;
              }

              if (event) continue; // unknown named event is structured data, never answer text

              const token = data;
              accumulatedMessage += token;
              this.emit('token', token);
            }

            if (isDoneEvent) {
              break;
            }
          }

          if (!this.aborted) {
            success = true;
            finalMessage = accumulatedMessage;
          }
        } finally {
          try {
            reader.cancel().catch(() => {});
          } catch {
          }
          this.abortController.abort();
        }
      } catch (err: any) {
        if (!this.aborted) {
          this.emit('error', err);
        }
      }

      if (success && !this.aborted) {
        this.emit('done', finalMessage);
      }
  }
}


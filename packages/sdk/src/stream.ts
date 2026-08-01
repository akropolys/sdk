import { ChatAction } from './types';

export interface KnowledgeImage {
  url: string;
  note?: string;
  caption?: string;
}

// One directed-knowledge entry's images, delivered as a structured
// knowledge_images SSE event — rendered like a card, never model-pasted.
export interface KnowledgeImageRef {
  entryId: string;
  title?: string;
  images: KnowledgeImage[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 data URLs attached by the user
  knowledgeImages?: KnowledgeImageRef[]; // owner-authored reference images backing this answer
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
  /** Present when this turn switched the shopper's preferred reply language. */
  language?: string;
  /** Action tags this site+plan permits, resolved server-side each turn. */
  allowedActions?: string[];
}

export type VizEvent =
  | { status: 'generating' }
  | { status: 'generating_video' }
  // Video outlives the chat stream: generation runs for minutes, the turn ends
  // in seconds. The server hands back the job id so the client can follow it
  // after the stream closes — without this the finished video has no way back.
  | { status: 'pending'; jobId: string }
  | { status: 'done'; url: string; id: string; mediaType?: 'image' | 'video' }
  | { status: 'failed'; reason?: string };

interface SSEFrame {
  event: string;
  data: string;
}

function parseSSEChunk(raw: string): SSEFrame[] {
  const frames: SSEFrame[] = [];
  const blocks = raw.split(/\n\n+/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = '';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        data = line.slice(5);
        // Per the SSE spec a single space after the colon is a delimiter, not
        // content. Keeping it prepended a space to EVERY token: in Latin text
        // the duplicates collapsed in HTML and went unnoticed, but in Tamil,
        // Thai and other complex scripts a token boundary falls inside a
        // grapheme, so the space landed between a consonant and its vowel sign
        // and split the ligature apart.
        if (data.startsWith(' ')) data = data.slice(1);
      }
    }
    // An event with empty data is still a frame — `done` carries no payload.
    if (data !== '' || event !== '') frames.push({ event, data });
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

  on(event: 'token' | 'meta' | 'done' | 'error' | 'entity_ref' | 'viz' | 'thinking' | 'knowledge_images', callback: Function): this {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }

  off(event: 'token' | 'meta' | 'done' | 'error' | 'entity_ref' | 'viz' | 'thinking' | 'knowledge_images', callback: Function): this {
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
    try {
      const response = await this.responsePromise;
      if (this.aborted) return;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedMessage = '';

      let isDoneEvent = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done || this.aborted || isDoneEvent) break;

        buffer += decoder.decode(value, { stream: true });

        const lastBoundary = buffer.lastIndexOf('\n\n');
        if (lastBoundary === -1) continue;

        const complete = buffer.slice(0, lastBoundary + 2);
        buffer = buffer.slice(lastBoundary + 2);

        const frames = parseSSEChunk(complete);

        for (const { event, data } of frames) {
          if (this.aborted) return;

          if (event === 'meta') {
            try {
              const meta: ChatMetadata = JSON.parse(data);
              this.emit('meta', meta);
            } catch {
              // ignore parse errors
            }
            continue;
          }

          if (event === 'entity_ref') {
            try {
              const ref = JSON.parse(data);
              this.emit('entity_ref', ref);
            } catch {
              // ignore parse errors
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
              // ignore parse errors
            }
            continue;
          }

          if (event === 'thinking') {
            try {
              const { text } = JSON.parse(data);
              if (text) this.emit('thinking', text);
            } catch {
              // ignore parse errors
            }
            continue;
          }

          if (event === 'status') {
            try {
              const status = JSON.parse(data);
              this.emit('status', status);
            } catch {
              // ignore parse errors
            }
            continue;
          }

          if (event === 'viz') {
            try {
              const viz: VizEvent = JSON.parse(data);
              this.emit('viz', viz);
            } catch {
              // ignore parse errors
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
            // Stable machine-readable code, when the server sent one, so the
            // UI can render this in the shopper's language instead of the
            // English fallback message.
            if (code) (err as Error & { code?: string }).code = code;
            throw err;
          }

          // Plain token — convert literal \n to actual newline
          const token = data.replace(/\\n/g, '\n');
          accumulatedMessage += token;
          this.emit('token', token);
        }

        if (isDoneEvent) {
          break;
        }
      }

      if (!this.aborted) {
        this.emit('done', accumulatedMessage);
      }
    } catch (err: any) {
      if (!this.aborted) {
        this.emit('error', err);
      }
    }
  }
}

import { CartPayload, ChatAction } from './types';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 data URLs attached by the user
  cartSnapshot?: CartPayload;
  actionType?: string;
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
  checkout?: CartPayload;
}

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
      else if (line.startsWith('data:')) data = line.slice(5);
    }
    if (data !== '') frames.push({ event, data });
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

  on(event: 'token' | 'meta' | 'done' | 'error' | 'entity_ref', callback: Function): this {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }

  off(event: 'token' | 'meta' | 'done' | 'error' | 'entity_ref', callback: Function): this {
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

      while (true) {
        const { done, value } = await reader.read();
        if (done || this.aborted) break;

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

          if (event === 'done') {
            break;
          }

          if (event === 'error') {
            let msg = 'Stream error';
            try {
              msg = JSON.parse(data).error ?? msg;
            } catch {
              msg = data;
            }
            throw new Error(msg);
          }

          // Plain token — convert literal \n to actual newline
          const token = data.replace(/\\n/g, '\n');
          accumulatedMessage += token;
          this.emit('token', token);
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

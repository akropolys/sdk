// A conversation a person from the site's team has been asked into; kept per site so a reload does not lose it.
export interface HumanConversation {
  id: string;
  token: string;
  cursor: number; // id of the last message already shown
}

export interface ConversationEvent {
  type: 'message' | 'status' | 'summary' | 'created';
  conversationId?: string;
  message?: { id: number; role: 'visitor' | 'kiku' | 'human' | 'system'; text: string; at: string; kind?: string };
  status?: 'waiting' | 'human' | 'kiku' | 'closed';
}

// One of the visitor's own requests for a person, as listed when they come back.
export interface VisitorRequest {
  id: string;
  status: 'waiting' | 'human' | 'kiku' | 'closed';
  summary: string;
  lastMessage?: { id: number; role: 'visitor' | 'kiku' | 'human' | 'system'; text: string; at: string };
  lastMessageAt?: string;
}

const storageKey = (siteId: string) => `akropolys_conversation_${siteId}`;

export function loadConversation(siteId: string): HumanConversation | null {
  if (typeof window === 'undefined') return null;
  try {
    const c = JSON.parse(localStorage.getItem(storageKey(siteId)) || 'null');
    return c && typeof c.id === 'string' && typeof c.token === 'string' ? { id: c.id, token: c.token, cursor: Number(c.cursor) || 0 } : null;
  } catch {
    return null;
  }
}

export function saveConversation(siteId: string, c: HumanConversation | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (c) localStorage.setItem(storageKey(siteId), JSON.stringify(c));
    else localStorage.removeItem(storageKey(siteId));
  } catch {}
}

// One connection to the conversation's live feed; resolves with the HTTP status when the server ends it.
export async function listenConversation(
  url: string,
  headers: Record<string, string>,
  onEvent: (e: ConversationEvent) => void,
  signal: AbortSignal,
): Promise<number> {
  const res = await fetch(url, { headers, signal });
  if (!res.ok || !res.body) return res.status;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return res.status;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const data = block.split('\n').find(l => l.startsWith('data: '));
      if (!data) continue;
      try { onEvent(JSON.parse(data.slice(6))); } catch {}
    }
  }
}

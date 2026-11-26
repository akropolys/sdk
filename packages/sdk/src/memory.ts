import type { ChatMessage } from './stream';

// Opt-in chat memory: a remembered chat lives on kiku's server under the
// visitor's Kiku identity for 24 hours after the last message.

export type MemoryChoice = 'on' | 'off' | null;
export interface ReturnPage { url: string; title: string; text: string }
export interface StoredThread { v: 1; session?: string; messages: ChatMessage[] }
interface PendingReturn { at: number; token?: string; tab: string }

const RETURN_TTL = 3_600_000;
const TURN_TTL = 90_000;
const choiceKey = (site: string) => `akropolys_memory_${site}`;
const returnKey = (site: string) => `akropolys_return_${site}`;
const turnKey = (site: string) => `akropolys_turn_${site}`;

export const tabId = (() => {
  try {
    const kept = sessionStorage.getItem('akropolys_tab');
    if (kept) return kept;
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('akropolys_tab', id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
})();

const read = <T>(key: string): T | null => {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};
const write = (key: string, value: unknown) => {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

export function memoryChoice(site: string): MemoryChoice {
  const v = read<string>(choiceKey(site));
  return v === 'on' || v === 'off' ? v : null;
}

export function setMemoryChoice(site: string, choice: 'on' | 'off'): void {
  write(choiceKey(site), choice);
}

// Text and product references only: no pictures, no voice, no team messages.
export function toStoredMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter(m => !m.human && !m.queued && (m.content?.trim() || m.images?.length || m.sources?.length || m.actionLinks?.length))
    .slice(-60)
    .map(m => {
      const out: ChatMessage = { role: m.role, content: m.content || '' };
      if (m.images?.length) out.content = out.content || '📷';
      if (m.sources?.length) out.sources = m.sources.slice(0, 12).map(({ id, url, name, image, details, fields }) => ({ id, url, name, image: image?.startsWith('data:') ? undefined : image, details, fields }));
      if (m.referencedIds?.length) out.referencedIds = m.referencedIds;
      if (m.actionLinks?.length) out.actionLinks = m.actionLinks;
      if (m.intent) out.intent = m.intent;
      return out;
    });
}

// A link left from a remembered chat; any tab that loads next may pick it up.
export function markReturn(site: string, token?: string): void {
  write(returnKey(site), { at: Date.now(), token, tab: tabId } satisfies PendingReturn);
}

export function takeReturn(site: string): { token?: string } | null {
  const r = read<PendingReturn>(returnKey(site));
  write(returnKey(site), null);
  if (!r || typeof r.at !== 'number' || Date.now() - r.at > RETURN_TTL || r.at > Date.now()) return null;
  return { token: typeof r.token === 'string' ? r.token : undefined };
}

export function returnPending(site: string, token?: string): boolean {
  const r = read<PendingReturn>(returnKey(site));
  return !!r && Date.now() - r.at <= RETURN_TTL && (!token || r.token === token);
}

export function clearReturn(site: string): void {
  write(returnKey(site), null);
}

// What the landing page shows, for kiku to describe. Never trusted.
export function returnPage(): ReturnPage {
  const root = (document.querySelector('main') || document.body) as HTMLElement | null;
  const text = (root?.innerText || '').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, 4000);
  const url = (() => { try { const u = new URL(location.href); u.hash = ''; return u.toString(); } catch { return ''; } })();
  return { url: url.slice(0, 500), title: (document.title || '').slice(0, 200), text };
}

// One turn at a time across this site's tabs.
export function holdTurn(site: string): void {
  write(turnKey(site), { tab: tabId, at: Date.now() });
}

export function releaseTurn(site: string): void {
  const t = read<{ tab: string }>(turnKey(site));
  if (t?.tab === tabId) write(turnKey(site), null);
}

export function turnElsewhere(site: string): boolean {
  const t = read<{ tab: string; at: number }>(turnKey(site));
  return !!t && t.tab !== tabId && Date.now() - t.at < TURN_TTL;
}

export const memoryKeys = { choiceKey, returnKey, turnKey };

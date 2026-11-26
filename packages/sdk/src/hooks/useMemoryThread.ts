import { useCallback, useEffect, useRef, useState } from 'react';
import type { AkropolysClient } from '../client';
import type { ChatMessage } from '../stream';
import { memoryChoice, setMemoryChoice, toStoredMessages, holdTurn, releaseTurn, turnElsewhere, clearReturn, memoryKeys, mergeRestored } from '../memory';

export interface MemoryState {
  on: boolean;          // this chat is remembered
  choice: 'on' | 'off' | null;
  hydrated: boolean;    // the remembered chat (if any) has been loaded
  elsewhere: boolean;   // another tab of this site is mid-turn
  enable: () => Promise<void>;
  decline: () => void;
  disable: () => void;
  end: () => void;
}

const channelName = (site: string) => `akropolys-thread-${site}`;

// Keeps a remembered chat on kiku's server and in step across this site's tabs.
export function useMemoryThread(
  client: AkropolysClient | null | undefined,
  messages: ChatMessage[],
  setMessages: (m: ChatMessage[]) => void,
  busy: boolean,
  blocked: boolean,
): MemoryState {
  const site = client?.api.siteId ?? '';
  const [choice, setChoice] = useState(() => (site ? memoryChoice(site) : null));
  const [hasKey, setHasKey] = useState(() => !!client?.getKikuKey());
  const on = choice === 'on' && hasKey && !!site;
  const [hydrated, setHydrated] = useState(!on);
  const [elsewhere, setElsewhere] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const savedRef = useRef('');
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const load = useCallback(async () => {
    if (!client || !on) return;
    try {
      const thread = await client.api.getThread();
      if (thread?.session) client.adoptSessionId(thread.session);
      if (thread?.messages?.length && !busy) {
        savedRef.current = JSON.stringify(thread.messages);
        setMessages(mergeRestored(messagesRef.current, thread.messages));
      }
    } catch { /* offline: keep what is shown */ }
    setHydrated(true);
  }, [client, on, busy, setMessages]);

  // Load once when memory is on.
  useEffect(() => { if (on && !hydrated) void load(); }, [on, hydrated, load]);

  // Another tab finished a turn or ended the chat.
  useEffect(() => {
    if (!site || typeof window === 'undefined') return;
    const ch = typeof BroadcastChannel === 'function' ? new BroadcastChannel(channelName(site)) : null;
    channel.current = ch;
    const check = () => setElsewhere(turnElsewhere(site));
    if (ch) ch.onmessage = e => {
      if (e.data === 'ended') { savedRef.current = ''; setMessages([]); }
      if (e.data === 'saved' && !busy) void load();
      check();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === memoryKeys.turnKey(site)) check();
      if (e.key === memoryKeys.choiceKey(site)) setChoice(memoryChoice(site));
    };
    window.addEventListener('storage', onStorage);
    const timer = setInterval(check, 2000);
    check();
    return () => { ch?.close(); channel.current = null; window.removeEventListener('storage', onStorage); clearInterval(timer); };
  }, [site, busy, load, setMessages]);

  // Hold the turn while answering; save when it settles.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (!site) return;
    if (busy && !wasBusy.current && on) holdTurn(site);
    if (!busy && wasBusy.current) {
      releaseTurn(site);
      if (on && hydrated && !blocked && client) {
        const stored = toStoredMessages(messagesRef.current);
        const raw = JSON.stringify(stored);
        if (stored.length && raw !== savedRef.current) {
          savedRef.current = raw;
          client.api.putThread({ v: 1, session: client.getSessionId(), messages: stored })
            .then(() => channel.current?.postMessage('saved'))
            .catch(() => { savedRef.current = ''; });
        }
      }
    }
    wasBusy.current = busy;
  }, [busy, on, hydrated, blocked, client, site]);

  useEffect(() => () => { if (site) releaseTurn(site); }, [site]);

  const forget = useCallback(() => {
    savedRef.current = '';
    if (site) clearReturn(site);
    void client?.api.deleteThread().catch(() => {});
    channel.current?.postMessage('ended');
  }, [client, site]);

  const enable = useCallback(async () => {
    if (!client || !site) return;
    if (!client.getKikuKey()) await client.mintKikuKey();
    setHasKey(!!client.getKikuKey());
    setMemoryChoice(site, 'on');
    setChoice('on');
    setHydrated(true);
    const stored = toStoredMessages(messagesRef.current);
    if (stored.length) {
      savedRef.current = JSON.stringify(stored);
      await client.api.putThread({ v: 1, session: client.getSessionId(), messages: stored }).catch(() => { savedRef.current = ''; });
    }
  }, [client, site]);

  const decline = useCallback(() => {
    if (!site) return;
    setMemoryChoice(site, 'off');
    setChoice('off');
  }, [site]);

  const disable = useCallback(() => {
    if (!site) return;
    if (on) forget();
    setMemoryChoice(site, 'off');
    setChoice('off');
  }, [site, on, forget]);

  const end = useCallback(() => { if (on) forget(); }, [on, forget]);

  return { on, choice, hydrated: hydrated || !on, elsewhere, enable, decline, disable, end };
}

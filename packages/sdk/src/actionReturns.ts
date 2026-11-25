type PendingReturn = { token: string; at: number; left: boolean };
type ReturnState = { pending: PendingReturn[]; used: string[] };
const memory = new Map<string, ReturnState>();
const eventName = 'akropolys:action-return';
const key = (site: string) => `akropolys:action-returns:${site}`;

function load(site: string): ReturnState {
  let state = memory.get(site) || { pending: [], used: [] };
  try {
    const stored = JSON.parse(sessionStorage.getItem(key(site)) || 'null');
    if (Array.isArray(stored?.pending) && Array.isArray(stored?.used)) state = stored;
  } catch {}
  state.pending = state.pending.filter(item => typeof item?.token === 'string' && /^[a-f0-9]{64}$/.test(item.token)
    && typeof item.at === 'number' && Date.now() - item.at < 3_600_000 && item.at <= Date.now());
  return state;
}

function save(site: string, state: ReturnState) {
  memory.set(site, state);
  try { sessionStorage.setItem(key(site), JSON.stringify(state)); } catch {}
}

export function armActionReturn(site: string, token?: string) {
  if (typeof window === 'undefined' || !site || !token || !/^[a-f0-9]{64}$/.test(token)) return;
  const state = load(site);
  if (state.used.includes(token) || state.pending.some(item => item.token === token)) return;
  state.pending = [...state.pending.slice(-9), { token, at: Date.now(), left: false }];
  save(site, state);
  window.dispatchEvent(new CustomEvent(eventName, { detail: { site } }));
}

export function watchActionReturns(site: string, resume: (token: string) => boolean) {
  let inFlight: string | undefined;
  let retryAfter = 0;
  let failures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const leave = () => {
    failures = 0;
    retryAfter = 0;
    const state = load(site);
    state.pending.forEach(item => { item.left = true; });
    save(site, state);
  };
  const check = () => {
    if (disposed || inFlight || Date.now() < retryAfter || failures >= 3 || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    const state = load(site);
    const pending = state.pending.find(item => item.left);
    if (!pending) return;
    inFlight = pending.token;
    if (!resume(pending.token)) inFlight = undefined;
  };
  const visibility = () => { if (document.hidden) leave(); else check(); };
  const armed = () => { if (document.hidden) leave(); };
  window.addEventListener('blur', leave);
  window.addEventListener('pagehide', leave);
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  window.addEventListener(eventName, armed);
  document.addEventListener('visibilitychange', visibility);
  return {
    check,
    ack(token: string) {
      if (inFlight !== token) return;
      const state = load(site);
      state.pending = state.pending.filter(item => item.token !== token);
      state.used = [...state.used.slice(-99), token];
      save(site, state);
      inFlight = undefined;
      failures = 0;
    },
    fail(token: string) {
      if (inFlight !== token) return;
      inFlight = undefined;
      failures++;
      retryAfter = Date.now() + 3000;
      if (retryTimer) clearTimeout(retryTimer);
      if (failures < 3) retryTimer = setTimeout(check, 3000);
    },
    clear() { inFlight = undefined; if (retryTimer) clearTimeout(retryTimer); const state = load(site); state.pending = []; save(site, state); },
    dispose() {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('blur', leave);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener(eventName, armed);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}

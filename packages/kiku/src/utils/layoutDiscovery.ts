let seenThisVisit = false;

export function hasSeenLayoutHint(): boolean {
  if (seenThisVisit) return true;
  try {
    return localStorage.getItem('akropolys_layout_hint_seen') === 'true'
      || localStorage.getItem('akropolys_chat_layout') === 'wide';
  } catch { return false; }
}

export function rememberLayoutHintSeen(): void {
  seenThisVisit = true;
  try { localStorage.setItem('akropolys_layout_hint_seen', 'true'); } catch {}
}

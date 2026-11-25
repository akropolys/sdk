// kiku.js: draws a small button and loads the widget only when it is used.
(() => {
  if (window.Kiku) return;
  const script = document.currentScript || document.querySelector('script[src*="/kiku.js"]');
  if (!script) return;
  const base = script.src;
  const url = new URL('./embed/embed.js', base).href;
  const cssUrl = new URL('./styles.css', base).href;
  const workletUrl = new URL('./voice-worklet.js', base).href;
  const data = script.dataset;
  let styled;
  let instance;
  let pending;
  let launcher;
  let identity;

  function loadStyles() {
    if (styled) return styled;
    const styles = document.createElement('link');
    styles.rel = 'stylesheet';
    styles.href = cssUrl;
    styled = new Promise((resolve, reject) => {
      styles.onload = resolve;
      styles.onerror = () => { styled = undefined; reject(new Error('Kiku styles could not load.')); };
    });
    document.head.append(styles);
    return styled;
  }

  let warmed = false;
  function warm() {
    if (warmed) return;
    warmed = true;
    const hint = document.createElement('link');
    hint.rel = 'modulepreload';
    hint.href = url;
    document.head.append(hint);
    loadStyles().catch(() => {});
  }

  function siteFromKey(key) {
    const k = (key || '').trim(), dot = k.lastIndexOf('.');
    if (!/^sk_(live|test)_/.test(k) || dot < 0) return '';
    try {
      const s = new TextDecoder().decode(Uint8Array.from(atob(k.slice(dot + 1).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
      return /^[!-~]{1,200}$/.test(s) ? s : '';
    } catch { return ''; }
  }

  const bodyReady = () => document.body ? Promise.resolve()
    : new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));

  const api = window.Kiku = {
    mount(options = {}) {
      if (pending) return pending;
      pending = Promise.all([import(url), loadStyles(), bodyReady()])
        .then(([module]) => {
          instance = module.mount({ ...options, ...identity, button: { ...options.button, voiceWorkletUrl: options.button?.voiceWorkletUrl || workletUrl } });
          const hadFocus = !!launcher?.shadowRoot?.activeElement;
          if (launcher) { launcher.remove(); launcher = undefined; }
          if (hadFocus) document.getElementById('kiku-embed')?.shadowRoot?.querySelector('button')?.focus();
          return instance;
        })
        .catch(error => { pending = undefined; throw error; });
      return pending;
    },
    open() { return ready().then(widget => widget.open()); },
    ingest(entities) { return ready().then(widget => widget.ingest(entities)); },
    updateIdentity(next) {
      if (!pending && siteId) { identity = { ...next }; return Promise.resolve(); }
      return ready().then(widget => widget.updateIdentity(next));
    },
    async destroy() {
      if (launcher) { launcher.remove(); launcher = undefined; }
      if (!pending) return;
      try { (await pending).destroy(); } finally { instance = undefined; pending = undefined; }
    }
  };

  const apiToken = data.key || data.apiToken;
  const siteId = data.siteId || siteFromKey(apiToken);
  if (!siteId) {
    if (apiToken) console.warn('[Kiku] Check data-key: copy your public key from Shell.');
    loadStyles().catch(() => {});
    return;
  }

  const options = {
    siteId, apiToken, apiUrl: data.apiUrl, voiceUrl: data.voiceUrl,
    container: data.container,
    button: { label: data.label || 'Ask Kiku', enableVoice: data.voice === 'true', enableVision: data.vision === 'true' }
  };
  // data-title, data-logo and data-brand-icon: the site's own name and marks in the chat
  for (const k of ['title', 'logo', 'brandIcon']) if (data[k]) options.button[k] = data[k];

  const report = error => {
    window.dispatchEvent(new CustomEvent('kiku:error', { detail: error }));
    console.error('[Kiku]', error);
  };

  function ready() {
    if (!pending) {
      if (!siteId) return Promise.reject(new Error('Call Kiku.mount() first.'));
      if (!options.container) {
        // Opened from code rather than a click: use the first tag, if any.
        const tag = document.querySelector('kiku-button');
        options.container = tag || undefined;
        launcher ||= [...launchers].find(l => l.parentNode === (tag || document.body));
      }
      const started = api.mount(options);
      started.catch(report);
    }
    return pending;
  }

  Object.defineProperty(api, 'ready', { get: ready, enumerable: false });

  const launchers = new Set();
  const STYLE = '<style>:host{color-scheme:light}button{font:500 14px system-ui,sans-serif;cursor:pointer;border:1px solid #d9c6b0;border-radius:999px;padding:14px 20px;background:#f7f1e8;color:#3b2a1d;box-shadow:0 3px 16px #0002}button:focus-visible{outline:2px solid #a9714b;outline-offset:3px}button[aria-busy=true]{cursor:progress;opacity:.8}</style>';

  // A launcher inside place (inline), or floating in the corner when place is null.
  function drawLauncher(place) {
    const host = document.createElement('div');
    if (!launchers.size) host.id = 'kiku-launcher';
    host.style.cssText = place ? 'all:initial;display:inline-block;vertical-align:middle'
      : 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483000';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = STYLE + '<button type="button" aria-haspopup="dialog" aria-expanded="false"></button>';
    const button = shadow.querySelector('button');
    const label = place?.getAttribute?.('label') || options.button.label;
    button.textContent = label;
    for (const type of ['pointerenter', 'touchstart', 'focus']) button.addEventListener(type, warm, { once: true, passive: true });
    button.addEventListener('click', () => {
      if (!pending) {
        // The widget goes where it was first opened from.
        options.container = place || undefined;
        if (place) options.button = { ...options.button, label };
        launcher = host;
      }
      button.setAttribute('aria-busy', 'true');
      button.textContent = label;
      ready().then(widget => { button.removeAttribute('aria-busy'); widget.open(); }).catch(() => {
        button.removeAttribute('aria-busy');
        button.textContent = 'Couldn’t load. Try again';
      });
    });
    launchers.add(host);
    (place || document.body).append(host);
    return host;
  }

  const removeLaunchers = () => { for (const l of launchers) l.remove(); launchers.clear(); };
  const destroy = api.destroy;
  api.destroy = () => { removeLaunchers(); return destroy(); };

  if (data.eager === 'true') {
    bodyReady().then(() => {
      options.container = data.container || document.querySelector('kiku-button') || undefined;
      ready();
    });
    return;
  }

  // <kiku-button></kiku-button> puts kiku wherever the tag is, including tags a
  // framework renders later. data-container still works; with neither, kiku floats.
  let floating;
  const tagged = el => el.querySelector(':scope > #kiku-embed') || [...launchers].some(l => l.parentNode === el);
  if (window.customElements && !customElements.get('kiku-button')) {
    customElements.define('kiku-button', class extends HTMLElement {
      connectedCallback() {
        if (data.container || tagged(this)) return;
        if (floating && !pending) { floating.remove(); launchers.delete(floating); floating = undefined; }
        drawLauncher(this);
      }
    });
  }

  bodyReady().then(() => {
    let place = null;
    try { place = data.container ? document.querySelector(data.container) : null; } catch {}
    if (place) drawLauncher(place);
    else if (!document.querySelector('kiku-button')) floating = drawLauncher(null);
  });
})();

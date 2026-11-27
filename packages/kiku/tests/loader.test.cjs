// The kiku.js loader must cost a page nothing but itself until a shopper
// shows intent. Run: node tests/loader.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/loader.js'), 'utf8')
  .replace('import(url)', '__import(url)');

function el(tag) {
  const listeners = {};
  const node = {
    tagName: tag, children: [], attrs: {}, style: {}, dataset: {}, removed: false,
    append(...kids) { node.children.push(...kids); for (const k of kids) { k.parentNode = node; if (k.rel === 'stylesheet' && k.onload) queueMicrotask(k.onload); } },
    remove() { node.removed = true; node.parentNode = null; },
    querySelector() { return null; },
    getAttribute(k) { return node.attrs[k] ?? null; },
    setAttribute(k, v) { node.attrs[k] = v; },
    removeAttribute(k) { delete node.attrs[k]; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    fire(type) { for (const fn of listeners[type] || []) fn({ type }); },
    attachShadow() {
      const button = el('button');
      const shadow = { set innerHTML(v) { shadow.html = v; }, querySelector: () => button, button, activeElement: null };
      node.shadow = node.shadowRoot = shadow;
      button.focus = () => { shadow.activeElement = button; };
      return shadow;
    },
  };
  return node;
}

function load(dataset, { noCurrentScript = false, failImport = false, tags = [], fetch } = {}) {
  const head = el('head');
  const body = el('body');
  const calls = { imports: [], mounts: [], opens: 0 };
  const realButton = { focused: false, focus() { realButton.focused = true; } };
  const widget = { open() { calls.opens++; }, ingest: async e => e, destroy() {} };
  const script = { src: 'https://cdn.example/kiku/2.2.44/kiku.js', dataset };
  const header = el('header');
  // A minimal custom-elements registry: define() upgrades tags already on the page.
  const registry = new Map();
  const customElements = {
    get: name => registry.get(name),
    define(name, cls) { registry.set(name, cls); for (const tag of tags) cls.prototype.connectedCallback.call(tag); },
  };
  const connect = tag => { tags.push(tag); registry.get('kiku-button')?.prototype.connectedCallback.call(tag); };
  const window = { dispatchEvent() {}, customElements, fetch };
  const ctx = {
    window, customElements, fetch, HTMLElement: class {}, console, URL, Promise, Object, Error, queueMicrotask, atob, TextDecoder, Uint8Array, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
    document: {
      currentScript: noCurrentScript ? null : script,
      querySelector: sel => (sel.includes('/kiku.js') ? script : sel === '#header' ? header : sel === 'kiku-button' ? tags[0] || null : null),
      getElementById: id => (id === 'kiku-embed' ? { shadowRoot: { querySelector: () => realButton } } : null),
      head, body, createElement: el, addEventListener() {},
    },
    __import(u) { calls.imports.push(u); if (failImport) return Promise.reject(new Error('offline')); return Promise.resolve({ mount(o) { calls.mounts.push(o); return widget; } }); },
  };
  vm.runInNewContext(source, ctx);
  return { Kiku: window.Kiku, head, body, calls, realButton, header, connect };
}

const tick = () => new Promise(r => setTimeout(r, 0));
const links = head => head.children.map(c => c.rel);

(async () => {
  // A page view draws the button and loads nothing else.
  let t = load({ siteId: 'shop', apiToken: 'tok', label: 'Ask us', vision: 'true' });
  await tick();
  assert.equal(t.body.children.length, 1, 'launcher drawn');
  const launcher = t.body.children[0];
  assert.equal(launcher.id, 'kiku-launcher');
  assert.deepEqual(links(t.head), [], 'no stylesheet or preload before intent');
  assert.equal(t.calls.imports.length, 0, 'widget not fetched on page view');
  const button = launcher.shadow.button;
  assert.equal(button.textContent, 'Ask us');

  // Intent fetches the widget without running it.
  button.fire('pointerenter');
  assert.deepEqual(links(t.head), ['modulepreload', 'stylesheet']);
  assert.equal(t.head.children[0].href, 'https://cdn.example/kiku/2.2.44/embed/embed.js');
  button.fire('focus');
  assert.equal(t.head.children.length, 2, 'warming happens once');
  assert.equal(t.calls.imports.length, 0);

  // With fetch, intent also preloads kiku's font faces.
  const fetched = [];
  const ft = load({ siteId: 'shop' }, { fetch: async u => { fetched.push(u); return { ok: true, json: async () => ({ family: 'Geist', faces: [{ url: '/fonts/v1/geist-latin.woff2' }, { url: 'https://evil.example/x.woff2' }] }) }; } });
  await tick();
  ft.body.children[0].shadow.button.fire('pointerenter');
  await tick(); await tick();
  assert.deepEqual(fetched, ['https://api.akropolys.cloud/v1/fonts/v1/base']);
  const pre = ft.head.children.filter(c => c.rel === 'preload');
  assert.equal(pre.length, 1, 'only same-api faces are preloaded');
  assert.equal(pre[0].href, 'https://api.akropolys.cloud/v1/fonts/v1/geist-latin.woff2');
  assert.equal(pre[0].as, 'font');

  // A click mounts the widget, opens it and hands over the button's place.
  button.fire('click');
  await tick(); await tick();
  assert.equal(t.calls.imports.length, 1);
  const opts = t.calls.mounts[0];
  assert.equal(opts.siteId, 'shop');
  assert.equal(opts.apiToken, 'tok');
  assert.equal(opts.button.enableVision, true);
  assert.equal(opts.button.enableVoice, false);
  assert.equal(opts.button.voiceWorkletUrl, 'https://cdn.example/kiku/2.2.44/voice-worklet.js');
  assert.equal(t.calls.opens, 1);
  assert.equal(launcher.removed, true, 'launcher removed once the widget is up');
  button.fire('click');
  await tick();
  assert.equal(t.calls.imports.length, 1, 'mounted once');

  // Code that awaits Kiku.ready or calls Kiku.* still gets a mounted widget.
  t = load({ siteId: 'shop' });
  await tick();
  const w = await t.Kiku.ready;
  assert.ok(w && t.calls.mounts.length === 1);
  t = load({ siteId: 'shop' });
  assert.deepEqual(await t.Kiku.ingest({ id: 'a' }), { id: 'a' });
  assert.equal(t.calls.mounts.length, 1);

  // data-title, data-logo and data-brand-icon reach the button only when present.
  t = load({ siteId: 'shop', title: 'Harbour Home', brandIcon: 'https://shop.example/icon.svg' });
  await t.Kiku.ready;
  assert.equal(t.calls.mounts[0].button.title, 'Harbour Home');
  assert.equal(t.calls.mounts[0].button.brandIcon, 'https://shop.example/icon.svg');
  assert.ok(!('logo' in t.calls.mounts[0].button), 'no logo key when data-logo is absent');
  t = load({ siteId: 'shop', logo: 'https://shop.example/wordmark.svg' });
  await t.Kiku.ready;
  assert.equal(t.calls.mounts[0].button.logo, 'https://shop.example/wordmark.svg');
  assert.ok(!('title' in t.calls.mounts[0].button) && !('brandIcon' in t.calls.mounts[0].button));

  // data-eager keeps the old load-at-once behaviour.
  t = load({ siteId: 'shop', eager: 'true' });
  await tick(); await tick();
  assert.equal(t.calls.mounts.length, 1);
  assert.equal(t.body.children.length, 0, 'no launcher when eager');

  // Without data-site-id the page mounts by hand, as before.
  t = load({});
  await tick();
  assert.deepEqual(links(t.head), ['stylesheet']);
  await assert.rejects(t.Kiku.open(), /Call Kiku.mount\(\) first/);
  await t.Kiku.mount({ siteId: 'manual' });
  assert.equal(t.calls.mounts[0].siteId, 'manual');

  // Loaded as a module (no currentScript): the tag is found by its src.
  t = load({ siteId: 'shop' }, { noCurrentScript: true });
  await tick();
  assert.equal(t.body.children.length, 1, 'launcher drawn without currentScript');

  // Keyboard focus moves to the real button when the widget takes over.
  t = load({ siteId: 'shop' });
  await tick();
  const b2 = t.body.children[0].shadow.button;
  b2.focus();
  b2.fire('click');
  await tick(); await tick();
  assert.equal(t.realButton.focused, true, 'focus handed to the real button');

  // Serialising window.Kiku must not load the widget.
  t = load({ siteId: 'shop' });
  await tick();
  JSON.stringify(t.Kiku);
  assert.equal(t.calls.imports.length, 0, 'JSON.stringify does not mount');

  // A failed load says so and lets the shopper try again.
  t = load({ siteId: 'shop', label: 'Ask us' }, { failImport: true });
  await tick();
  const b3 = t.body.children[0].shadow.button;
  b3.fire('click');
  await tick(); await tick(); await tick();
  assert.match(b3.textContent, /Try again/);
  assert.equal(b3.attrs['aria-busy'], undefined);
  b3.fire('click');
  await tick(); await tick();
  assert.equal(t.calls.imports.length, 2, 'a second click retries');

  // data-container puts the button inside the page's element, inline.
  t = load({ siteId: 'shop', container: '#header' });
  await tick();
  assert.equal(t.body.children.length, 0, 'not floated on the body');
  assert.equal(t.header.children.length, 1, 'placed in the container');
  assert.match(t.header.children[0].style.cssText, /inline-block/);
  t.header.children[0].shadow.button.fire('click');
  await tick(); await tick();
  assert.equal(t.calls.mounts[0].container, t.header, 'the widget mounts into the same container');

  // A container that is not on the page falls back to the corner.
  t = load({ siteId: 'shop', container: '#missing' });
  await tick();
  assert.equal(t.body.children.length, 1);
  assert.match(t.body.children[0].style.cssText, /position:fixed/);

  // Identity before the widget loads is held, not a reason to load it.
  t = load({ siteId: 'shop' });
  await tick();
  await t.Kiku.updateIdentity({ shopperId: '7', userProof: 'p' });
  assert.equal(t.calls.imports.length, 0, 'updateIdentity does not load the widget');
  await t.Kiku.updateIdentity({});
  await t.Kiku.updateIdentity({ shopperId: '9', userProof: 'q' });
  t.body.children[0].shadow.button.fire('click');
  await tick(); await tick();
  assert.equal(t.calls.mounts[0].shopperId, '9');
  assert.equal(t.calls.mounts[0].userProof, 'q');

  // One value: a key that carries its site needs no data-site-id.
  const key = 'sk_live_abc_def.' + Buffer.from('kankan-shop').toString('base64url');
  t = load({ key });
  await tick();
  assert.equal(t.body.children.length, 1, 'starts from the key alone');
  t.body.children[0].shadow.button.fire('click');
  await tick(); await tick();
  assert.equal(t.calls.mounts[0].siteId, 'kankan-shop');
  assert.equal(t.calls.mounts[0].apiToken, key);
  // data-api-token works the same way, and an explicit data-site-id still wins.
  t = load({ apiToken: key, siteId: 'other' });
  await tick();
  t.body.children[0].shadow.button.fire('click');
  await tick(); await tick();
  assert.equal(t.calls.mounts[0].siteId, 'other');
  // An old key with no site and no data-site-id stays in manual mode.
  t = load({ apiToken: 'sk_live_abc_def' });
  await tick();
  assert.equal(t.body.children.length, 0);

  // <kiku-button> puts kiku where the tag is; no tag means it floats.
  const tag = el('kiku-button');
  t = load({ siteId: 'shop' }, { tags: [tag] });
  await tick();
  assert.equal(t.body.children.length, 0, 'nothing floats when the page has a tag');
  assert.equal(tag.children.length, 1, 'a button inside the tag');
  assert.match(tag.children[0].style.cssText, /inline-block/);
  tag.children[0].shadow.button.fire('click');
  await tick(); await tick();
  assert.equal(t.calls.mounts[0].container, tag, 'the widget mounts into the tag');
  assert.equal(t.calls.opens, 1);

  // Several tags: each opens the one widget; the tag's label is used.
  const a = el('kiku-button'), b = el('kiku-button');
  b.attrs.label = 'Help';
  t = load({ siteId: 'shop' }, { tags: [a, b] });
  await tick();
  assert.equal(b.children[0].shadow.button.textContent, 'Help');
  b.children[0].shadow.button.fire('click');
  await tick(); await tick();
  assert.equal(t.calls.mounts[0].container, b, 'mounted where it was first opened');
  assert.equal(t.calls.mounts[0].button.label, 'Help');
  a.children[0].shadow.button.fire('click');
  await tick(); await tick();
  assert.equal(t.calls.mounts.length, 1, 'still one widget');
  assert.equal(t.calls.opens, 2, 'the other tag opens it too');

  // A tag a framework renders later replaces the floating button.
  t = load({ siteId: 'shop' });
  await tick();
  const floatingHost = t.body.children[0];
  const late = el('kiku-button');
  t.connect(late);
  assert.equal(floatingHost.removed, true, 'floating button goes away');
  assert.equal(late.children.length, 1);

  // Opened from code: the first tag is still where it goes.
  const c = el('kiku-button');
  t = load({ siteId: 'shop' }, { tags: [c] });
  await tick();
  await t.Kiku.open();
  assert.equal(t.calls.mounts[0].container, c);

  console.log('loader tests passed');
})().catch(e => { console.error(e); process.exit(1); });

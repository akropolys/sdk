const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const utils = path.resolve(__dirname, '../src/utils');
function compiled(name) {
  return ts.transpileModule(fs.readFileSync(path.join(utils, name + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
function load(name, globals, imports) {
  const module = { exports: {} };
  vm.runInNewContext(compiled(name), { ...globals, module, exports: module.exports, require: imports }, { filename: name });
  return module.exports;
}
const recovery = load('voiceRecovery', {}, () => { throw Error('unexpected import'); });

test('retry policy excludes normal closes and all application refusals', () => {
  for (const code of [1000, 1001, 1008, 4402, 4403]) assert.equal(recovery.VoiceRecovery.canRetry(code), false);
  for (const code of [1006, 1011, 1012, 1013]) assert.equal(recovery.VoiceRecovery.canRetry(code), true);
  const budget = new recovery.VoiceRecovery();
  assert.equal(budget.nextDelay(), 500);
  assert.equal(budget.nextDelay(), 1500);
  assert.equal(budget.nextDelay(), null);
});

test('history snapshot keeps partial transcripts without mutating previous turns', () => {
  const turns = [{ role: 'user', text: 'Tell me more', done: true }, { role: 'assistant', text: 'The', done: false }];
  const got = recovery.recoveredTurns(turns, 'Tell me more', 'The article explains');
  assert.equal(got.length, 2);
  assert.equal(got[1].text, 'The article explains');
  assert.ok(got.every(t => t.done));
  assert.equal(turns[1].text, 'The');
});

function harness(options = {}) {
  const slots = [], effects = [], sockets = [], contexts = [], worklets = [], timers = new Map(), errors = [], exchanges = [];
  let cursor = 0, dirty = false, now = 1000, nextTimer = 1, api;
  const eq = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
  const react = {
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useState(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
      return [slots[i], v => { const next = typeof v === 'function' ? v(slots[i]) : v; if (next !== slots[i]) { slots[i] = next; dirty = true; } }];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !eq(slots[i].deps, deps)) slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !eq(slots[i].deps, deps)) {
        const old = slots[i]; slots[i] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const setTimer = (fn, delay, interval = false) => { const id = nextTimer++; timers.set(id, { fn, at: now + delay, delay, interval }); return id; };
  const clearTimer = id => timers.delete(id);
  class Ws {
    static OPEN = 1; static CONNECTING = 0;
    readyState = 0; bufferedAmount = 0; sent = [];
    listeners = {};
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    constructor() { sockets.push(this); }
    open() { this.readyState = 1; this.onopen?.({}); }
    send(value) { if (this.readyState !== 1) throw Error('closed'); this.sent.push(value); }
    message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
    close(code = 1000) { this.readyState = 3; for (const cb of this.listeners.close || []) cb({ code }); this.onclose?.({ code, reason: '' }); }
  }
  const param = () => ({ value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = () => ({ connect() {}, disconnect() {}, gain: param(), frequencyBinCount: 32, getByteTimeDomainData(out) { out.fill(128); }, getByteFrequencyData(out) { out.fill(0); } });
  class Context {
    state = 'running'; currentTime = 0; destination = {}; audioWorklet = { addModule: async () => {} };
    constructor() { contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createAnalyser() { return node(); } createGain() { return node(); } createMediaStreamSource() { return node(); }
  }
  const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const window = { location: { href: 'https://example.test' }, AudioContext: Context, setInterval: (fn, ms) => setTimer(fn, ms, true), clearInterval: clearTimer };
  const globals = {
    window, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } },
    WebSocket: Ws, AudioWorkletNode: class { constructor() { worklets.push(this); } port = {}; connect() {} disconnect() {} },
    URL, Blob, ArrayBuffer, Int16Array, Float32Array, Uint8Array, AbortController, console,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn, ms) => setTimer(fn, ms), clearTimeout: clearTimer, clearInterval: clearTimer,
  };
  const { useLiveVoice } = load('liveVoice', globals, name => {
    if (name === 'react') return react;
    if (name === './voiceRecovery') return recovery;
    if (name === './chime') return { chime() {}, primeChimes() {} };
    if (name === './adpcm') return { AdpcmEncoder: class { encode() { return new ArrayBuffer(4); } }, decodeAdpcm: () => new Float32Array(0) };
    if (name === './wav') return { int16ToWav: () => new Blob(), float32ToWav: () => new Blob() };
    if (name === './downscaleImage') return { downscaleImage: async () => 'data:image/jpeg;base64,/9j/4A==' };
    throw Error(name);
  });
  const opts = { apiUrl: 'https://example.test', siteId: 'news', token: 'test', onError: e => errors.push(e), onExchange: e => exchanges.push(e), ...options };
  function render() {
    let passes = 0;
    do {
      dirty = false; cursor = 0; api = useLiveVoice(opts);
      while (effects.length) effects.shift()();
      assert.ok(++passes < 20, 'render loop');
    } while (dirty);
    return api;
  }
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const pair = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!pair) break;
      const [id, timer] = pair; now = timer.at;
      if (timer.interval) timer.at += timer.delay; else timers.delete(id);
      timer.fn(); render();
    }
    now = end; render();
  }
  render();
  return { sockets, contexts, worklets, errors, exchanges, track, render, advance, get api() { return api; }, async start() {
    await api.start([{ role: 'user', text: 'Earlier question', done: true }]);
    sockets[0].open(); sockets[0].message({ type: 'ready', ...options.ready }); render();
  } };
}

test('recoverable close retains microphone and history; stale socket frames are ignored', async () => {
  const h = harness(); await h.start();
  h.sockets[0].message({ type: 'heard', text: 'Tell me more' }); h.render();
  h.sockets[0].message({ type: 'said', text: 'The article explains' }); h.render();
  h.sockets[0].close(1012); h.render();
  assert.equal(h.api.state, 'connecting'); assert.equal(h.track.stopped, false);
  h.sockets[0].message({ type: 'refused', code: 'credits' });
  h.advance(500);
  const next = h.sockets[1]; next.open();
  const opened = JSON.parse(next.sent[0]);
  assert.equal(opened.type, 'open');
  assert.deepEqual(opened.history.map(t => t.text), ['Earlier question', 'Tell me more', 'The article explains']);
  assert.ok(!next.sent.some(s => JSON.parse(s).type === 'text'), 'recovery must not replay actions');
  next.message({ type: 'ready' }); h.render();
  assert.equal(h.api.state, 'listening'); assert.equal(h.errors.length, 0);
  h.api.stop();
});

test('manual stop cancels pending recovery and closes the microphone', async () => {
  const h = harness(); await h.start();
  h.sockets[0].close(1006); h.api.stop(); h.advance(5000);
  assert.equal(h.sockets.length, 1); assert.equal(h.track.stopped, true); assert.equal(h.api.state, 'idle');
});

test('recovery budget survives ready frames and stops repeated failure loops', async () => {
  const h = harness(); await h.start();
  for (const delay of [500, 1500]) {
    h.sockets.at(-1).close(1012); h.advance(delay);
    h.sockets.at(-1).open(); h.sockets.at(-1).message({ type: 'ready' }); h.render();
  }
  h.sockets.at(-1).close(1012); h.advance(2000);
  assert.equal(h.sockets.length, 3); assert.equal(h.track.stopped, true);
  assert.ok(h.errors.includes('connection'));
});

test('normal replacement and allowance refusal never reconnect', async () => {
  for (const code of [1000, 4402]) {
    const h = harness(); await h.start(); h.sockets[0].close(code); h.advance(2000);
    assert.equal(h.sockets.length, 1); assert.equal(h.track.stopped, true);
  }
});

test('starting again during recovery does not create a competing session', async () => {
  const h = harness(); await h.start(); h.sockets[0].close(1012);
  await h.api.start(); h.advance(500);
  assert.equal(h.sockets.length, 2);
  h.api.stop();
});

test('a reconnect that never becomes ready times out and exhausts its budget', async () => {
  const h = harness(); await h.start(); h.sockets[0].close(1012);
  h.advance(70_000);
  assert.equal(h.sockets.length, 3);
  assert.ok(h.errors.includes('connection'));
  assert.equal(h.track.stopped, true);
});

test('suspended capture is resumed without replacing the conversation', async () => {
  const h = harness(); await h.start();
  h.contexts[0].state = 'suspended'; h.advance(12_000);
  assert.equal(h.contexts[0].state, 'running');
  h.worklets[0].port.onmessage({ data: new Int16Array(640).buffer }); h.advance(2_000);
  assert.equal(h.errors.length, 0); assert.equal(h.sockets.length, 1);
  h.api.stop();
});

test('a dead capture pipeline surfaces an error instead of listening forever', async () => {
  const h = harness(); await h.start(); h.advance(25_000);
  assert.ok(h.errors.includes('audio-capture')); assert.equal(h.track.stopped, true);
});


test('voice opens with browser actions and never sends a site bearer token to the voice server', async () => {
  let called = false;
  const h = harness({ getShopperAuth: async () => { called = true; return 'Bearer private'; } });
  await h.start();
  const frame = JSON.parse(h.sockets[0].sent[0]);
  assert.equal(frame.type, 'open');
  assert.equal(frame.browserActions, true);
  assert.equal(Object.hasOwn(frame, 'authorization'), false);
  assert.equal(called, false);
  h.api.stop();
});

test('voice actions use the same current auth adapter as chat through refresh and logout', async t => {
  const { AkropolysAPI } = require('../../sdk/dist/index.js');
  const previous = globalThis.window;
  globalThis.window = { location: { href: 'https://example.test' } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { requests.push(options.headers.get('Authorization')); return Response.json({ updated: true }); });
  let token = 'token-1';
  const siteApi = new AkropolysAPI('https://platform.test', 'site', 'public');
  siteApi.actionAuth = { provider: 'supabase', client: { auth: { async getSession() { return { data: { session: token ? { access_token: token } : null } }; } } } };
  const h = harness({ executeBrowserAction: (request, signal) => siteApi.executeBrowserAction(request, signal) });
  await h.start();
  const run = async id => {
    h.sockets[0].message({ type: 'browser_action', request: { id, name: 'update_cart', url: '/api/cart', method: 'PATCH', body: { quantity: 2 }, requiresSignIn: true } });
    await new Promise(resolve => setImmediate(resolve));
  };
  await run('browser_1'); token = 'token-2'; await run('browser_2'); token = null; await run('browser_3');
  assert.deepEqual(requests, ['Bearer token-1', 'Bearer token-2']);
  const replies = h.sockets[0].sent.map(s => JSON.parse(s)).filter(f => f.type === 'action_result');
  assert.equal(replies.length, 3);
  assert.equal(replies[2].result.status, 'needs_sign_in');
  assert.ok(!JSON.stringify(h.sockets[0].sent).includes('token-'));
  await run('browser_2');
  assert.equal(requests.length, 2);
  h.api.stop();
});

test('stopping voice aborts a pending browser action and discards a late result', async () => {
  let finish, actionSignal;
  const h = harness({ executeBrowserAction: (_request, signal) => { actionSignal = signal; return new Promise(resolve => { finish = resolve; }); } });
  await h.start();
  h.sockets[0].message({ type: 'browser_action', request: { id: 'browser_1' } });
  h.api.stop();
  assert.equal(actionSignal.aborted, true);
  finish({ status: 'sent', httpStatus: 200 });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(!h.sockets[0].sent.some(s => JSON.parse(s).type === 'action_result'));
});


const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const photoFile = { type: 'image/png' };
const imageFrames = socket => socket.sent.map(value => JSON.parse(value)).filter(frame => frame.type === 'image');

test('voice sends photo pixels and waits for model delivery acknowledgement', async () => {
  const h = harness({ ready: { photos: true, imageInput: true }, storeScene: async () => true });
  await h.start();
  const uploaded = h.api.attachPhoto(photoFile); await settle();
  const frame = imageFrames(h.sockets[0])[0];
  assert.equal(frame.image, 'data:image/jpeg;base64,/9j/4A==');
  h.render(); assert.equal(h.api.images[0].sending, true);
  h.sockets[0].message({ type: 'image_received', imageId: frame.imageId });
  assert.equal(await uploaded, true); h.render();
  assert.equal(h.api.images[0].sending, false);
  assert.ok(!h.sockets[0].sent.some(value => JSON.parse(value).type === 'text'));
  h.api.stop();
});

test('photo reading works when the editing copy cannot be saved', async () => {
  const h = harness({ ready: { photos: true, imageInput: true }, storeScene: async () => false });
  await h.start(); const uploaded = h.api.attachPhoto(photoFile); await settle();
  const frame = imageFrames(h.sockets[0])[0];
  h.sockets[0].message({ type: 'image_received', imageId: frame.imageId });
  assert.equal(await uploaded, true); h.api.stop();
});

test('rejected photos disappear without ending the voice call', async () => {
  const h = harness({ ready: { photos: true, imageInput: true } });
  await h.start(); const uploaded = h.api.attachPhoto(photoFile); await settle();
  const frame = imageFrames(h.sockets[0])[0];
  h.sockets[0].message({ type: 'image_error', imageId: frame.imageId });
  assert.equal(await uploaded, false); h.render();
  assert.equal(h.api.images.length, 0); assert.equal(h.api.state, 'listening');
  assert.equal(h.track.stopped, false); h.api.stop();
});

test('reconnect restores the latest photo without replaying a request', async () => {
  const h = harness({ ready: { photos: true, imageInput: true } });
  await h.start(); const uploaded = h.api.attachPhoto(photoFile); await settle();
  const frame = imageFrames(h.sockets[0])[0];
  h.sockets[0].message({ type: 'image_received', imageId: frame.imageId }); await uploaded;
  h.sockets[0].close(1012); h.advance(500);
  const next = h.sockets[1]; next.open(); next.message({ type: 'ready', photos: true, imageInput: true });
  assert.equal(imageFrames(next).length, 1); assert.equal(imageFrames(next)[0].image, frame.image);
  assert.ok(!next.sent.some(value => JSON.parse(value).type === 'text'));
  h.api.stop();
});

test('stopping during photo upload never forwards the image to a stale socket', async () => {
  let release;
  const h = harness({ ready: { photos: true, imageInput: true }, storeScene: () => new Promise(resolve => { release = resolve; }) });
  await h.start(); const uploaded = h.api.attachPhoto(photoFile); await settle();
  h.api.stop(); release(true);
  assert.equal(await uploaded, false); assert.equal(imageFrames(h.sockets[0]).length, 0);
});

test('image delivery timeout settles the pending photo without ending the call', async () => {
  const h = harness({ ready: { photos: true, imageInput: true } });
  await h.start(); const uploaded = h.api.attachPhoto(photoFile); await settle();
  h.advance(15_000); assert.equal(await uploaded, false); h.render();
  assert.equal(h.api.images.length, 0); assert.equal(h.track.stopped, false); h.api.stop();
});

test('older voice servers retain the existing photo editing flow', async () => {
  const h = harness({ ready: { photos: true }, storeScene: async () => true });
  await h.start(); assert.equal(await h.api.attachPhoto(photoFile), true);
  assert.equal(imageFrames(h.sockets[0]).length, 0); h.api.stop();
});

test('stopping after a photo acknowledgement cannot restore it in a new call', async () => {
  const h = harness({ ready: { photos: true, imageInput: true } });
  await h.start(); const uploaded = h.api.attachPhoto(photoFile); await settle();
  const frame = imageFrames(h.sockets[0])[0];
  h.sockets[0].message({ type: 'image_received', imageId: frame.imageId });
  h.api.stop(); assert.equal(await uploaded, false);
  await h.api.start([]);
  const next = h.sockets.at(-1); next.open(); next.message({ type: 'ready', photos: true, imageInput: true });
  assert.equal(imageFrames(next).length, 0); h.api.stop();
});

test('recovery cancels a pending photo and waits for readiness before accepting another', async () => {
  const h = harness({ ready: { photos: true, imageInput: true } });
  await h.start(); const uploaded = h.api.attachPhoto(photoFile); await settle();
  h.sockets[0].close(1012); assert.equal(await uploaded, false);
  h.advance(500); const next = h.sockets[1]; next.open();
  assert.equal(await h.api.attachPhoto(photoFile), false);
  assert.equal(imageFrames(next).length, 0); h.api.stop();
});

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

function harness() {
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
    constructor() { sockets.push(this); }
    open() { this.readyState = 1; this.onopen?.({}); }
    send(value) { if (this.readyState !== 1) throw Error('closed'); this.sent.push(value); }
    message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code, reason: '' }); }
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
    URL, Blob, ArrayBuffer, Int16Array, Float32Array, Uint8Array, console,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn, ms) => setTimer(fn, ms), clearTimeout: clearTimer, clearInterval: clearTimer,
  };
  const { useLiveVoice } = load('liveVoice', globals, name => {
    if (name === 'react') return react;
    if (name === './voiceRecovery') return recovery;
    if (name === './chime') return { chime() {}, primeChimes() {} };
    if (name === './adpcm') return { AdpcmEncoder: class { encode() { return new ArrayBuffer(4); } }, decodeAdpcm: () => new Float32Array(0) };
    if (name === './wav') return { int16ToWav: () => new Blob(), float32ToWav: () => new Blob() };
    if (name === './downscaleImage') return {};
    throw Error(name);
  });
  const opts = { apiUrl: 'https://example.test', siteId: 'news', token: 'test', onError: e => errors.push(e), onExchange: e => exchanges.push(e) };
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
    sockets[0].open(); sockets[0].message({ type: 'ready' }); render();
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

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sdk = path.resolve(__dirname, '../../..');
const ts = require(sdk + '/node_modules/typescript');
const source = fs.readFileSync(sdk + '/packages/kiku/src/components/KikuDoodles.tsx', 'utf8');

function harness({ waitForContent = false, reducedMotion = false, width = 390, height = 760 } = {}) {
  let now = 0, next = 0, paints = 0;
  const frames = new Map(), timers = new Map(), effects = [], cleanups = [];
  const ctx = new Proxy({}, { get: (_, key) => key === 'stroke' || key === 'fill' ? () => paints++ : () => {}, set: () => true });
  const canvas = { clientWidth: width, clientHeight: height, width: 0, height: 0, getContext: () => ctx,
    closest: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) };
  const react = { memo: fn => fn, useRef: value => ({ current: value }), useState: value => [value, () => {}],
    useEffect: fn => effects.push(fn),
    createElement(type, props) { if (type === 'canvas') props.ref.current = canvas; return null; } };
  const module = { exports: {} };
  const setTimer = (fn, delay) => { const id = ++next; timers.set(id, { at: now + delay, fn }); return id; };
  const window = { innerHeight: height, devicePixelRatio: 1,
    matchMedia: query => ({ matches: query.includes('reduced-motion') && reducedMotion, addEventListener() {}, removeEventListener() {} }),
    setTimeout: setTimer };
  let resize;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, {
    module, exports: module.exports, require: name => { assert.equal(name, 'react'); return react; },
    window, performance: { now: () => now },
    getComputedStyle: () => ({ direction: 'ltr', getPropertyValue: () => '80,80,80' }),
    requestAnimationFrame: fn => { const id = ++next; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id), setTimeout: setTimer, clearTimeout: id => timers.delete(id),
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} disconnect() {} },
  });
  module.exports.default({ seed: 'new-website', theme: 'light', waitForContent });
  for (const effect of effects) cleanups.push(effect());
  return {
    frame(at, timestamp = at) { now = at; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(timestamp)); },
    advance(at) { now = at; for (const [id, timer] of [...timers]) if (timer.at <= at) { timers.delete(id); timer.fn(); } },
    resize(w, h) { canvas.clientWidth = w; canvas.clientHeight = h; resize(); },
    bloom: module.exports.bloomDoodles,
    thump: () => module.exports.thumpDoodles({ x: 190, y: 380, strength: 1 }),
    paints: () => paints, pending: () => frames.size,
    cleanup() { cleanups.forEach(fn => fn?.()); },
  };
}

test('a delayed first browser frame still gets the full opening animation', () => {
  const h = harness();
  h.frame(5000);
  assert.ok(h.pending() > 0, 'cold first frame skipped straight to the finished drawing');
  h.frame(5250);
  assert.ok(h.paints() > 0, 'opening never painted');
  assert.ok(h.pending() > 0);
  h.frame(6500);
  assert.equal(h.pending(), 0);
  h.cleanup();
});

test('loading thumps cannot reveal waiting glyphs or cancel their opening bloom', () => {
  const h = harness({ waitForContent: true });
  h.thump();
  assert.equal(h.paints(), 0, 'loading drew glyphs before their opening');
  h.bloom();
  h.frame(0);
  h.thump();
  assert.ok(h.pending() > 0, 'loading cancelled the opening animation');
  h.frame(1500);
  assert.equal(h.pending(), 0);
  const before = h.paints();
  h.thump();
  assert.ok(h.paints() > before, 'settled glyphs stopped reacting to the loader');
  h.cleanup();
});

test('a stale frame timestamp after cold initialization cannot skip the bloom', () => {
  const h = harness();
  h.frame(5000, 0);
  h.frame(5016, 5016);
  assert.ok(h.pending() > 0, 'stale first timestamp consumed the opening animation');
  h.frame(6500, 6500);
  assert.equal(h.pending(), 0);
  h.cleanup();
});

test('first opening still animates when canvas layout arrives late', () => {
  const h = harness({ width: 0, height: 0, waitForContent: true });
  h.bloom();
  assert.equal(h.pending(), 0);
  h.resize(390, 760);
  h.advance(2020);
  h.frame(7000);
  assert.ok(h.pending() > 0, 'late layout consumed the opening animation');
  h.cleanup();
});

test('reduced motion stays static and unmount cancels pending animation', () => {
  const staticCanvas = harness({ reducedMotion: true });
  assert.equal(staticCanvas.pending(), 0);
  const before = staticCanvas.paints();
  staticCanvas.thump();
  assert.equal(staticCanvas.paints(), before);
  staticCanvas.cleanup();
  const animated = harness();
  assert.equal(animated.pending(), 1);
  animated.cleanup();
  assert.equal(animated.pending(), 0);
});

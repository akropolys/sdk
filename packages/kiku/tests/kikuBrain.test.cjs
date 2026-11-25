const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sdk = path.resolve(__dirname, '../../..');
const ts = require(sdk + '/node_modules/typescript');
const source = fs.readFileSync(sdk + '/packages/kiku/src/components/kikuBrain.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function load() {
  let now = 0, next = 0;
  const frames = new Map(), timers = new Map();
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module, exports: module.exports,
    performance: { now: () => now },
    requestAnimationFrame: fn => { const id = ++next; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (fn, ms) => { const id = ++next; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const el = () => ({ attrs: {}, setAttribute(a, v) { this.attrs[a] = v; } });
  const parts = {};
  const svg = {
    ...el(), dataset: {}, style: { setProperty() {} }, classes: new Set(),
    classList: { toggle(c, on) { on ? svg.classes.add(c) : svg.classes.delete(c); } },
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 34, height: 34 }),
    querySelectorAll(sel) {
      const count = /eye|glint|open|arc|tuft path/.test(sel) ? (sel.includes('tuft') ? 3 : 2) : 1;
      return parts[sel] ||= Array.from({ length: count }, el);
    },
  };
  // Runs the frames that are due, then the timers that are due, until `ms` has passed.
  const run = ms => {
    const end = now + ms;
    while (now < end) {
      now += 16;
      const due = [...frames.values()]; frames.clear();
      due.forEach(fn => fn(now));
      for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); }
    }
  };
  return { mod: module.exports, svg, parts, run, frames };
}

test('kiku never picks the same idle action twice in a row', () => {
  const { mod } = load();
  const list = [['glance', 5], ['blink2', 1.2], ['twitch', 2], ['bounce', .25]];
  let last = '';
  for (let i = 0; i < 2000; i++) {
    const n = mod.pick(list, last);
    assert.notEqual(n, last);
    last = n;
  }
  for (const r of [0, .5, .999999]) assert.notEqual(mod.pick(list, 'glance', r), 'glance');
  assert.equal(mod.pick([['nod', 1]], 'nod'), 'nod'); // the only choice is still allowed
});

test('under reduced motion kiku snaps to each pose and the frame loop stops', () => {
  const { mod, svg, parts, run, frames } = load();
  const kiku = mod.createKiku(svg, () => {}, true, true);
  kiku.setBase('handoff');
  run(200);
  const fig = parts['.hsk-kiku-fig'][0];
  const pose = fig.attrs.transform;
  assert.ok(pose, 'kiku rendered');
  run(16);
  assert.equal(fig.attrs.transform, pose, 'no easing between frames');
  assert.equal(svg.dataset.state, 'handoff');
  assert.ok(svg.classes.has('hsk-kiku-reduced'));
  kiku.destroy();
  run(5000);
  assert.equal(frames.size, 0, 'nothing left running after destroy');
});

test('with motion on, kiku eases into a pose, and a hidden tab runs no frames', () => {
  const { mod, svg, parts, run, frames } = load();
  const kiku = mod.createKiku(svg, () => {}, false, false);
  kiku.setBase('listening');
  run(48);
  const fig = parts['.hsk-kiku-fig'][0], a = fig.attrs.transform;
  run(16);
  assert.notEqual(fig.attrs.transform, a, 'still moving toward the pose');
  kiku.pause(true);
  run(10000);
  assert.equal(frames.size, 0, 'a hidden tab runs no frames');
  kiku.destroy();
});

test('left alone, kiku stretches, yawns, gets drowsy, falls asleep, and wakes with a start', () => {
  const { mod, svg, run } = load();
  const kiku = mod.createKiku(svg, () => {}, false, false);
  const tiers = [0], firstAct = {};
  for (let t = 0; t < 130e3; t += 100) {
    run(100);
    if (kiku.tier !== tiers[tiers.length - 1]) tiers.push(kiku.tier);
    if (!(kiku.tier in firstAct) && kiku.tier) firstAct[kiku.tier] = kiku.act;
  }
  assert.deepEqual(tiers, [0, 1, 2, 3, 4], 'stretch unlocked, yawns unlocked, drowsy, asleep, in order');
  assert.equal(firstAct[1], 'stretch');
  assert.equal(firstAct[2], 'yawn');
  assert.ok(svg.classes.has('hsk-kiku-asleep'), 'the z\'s show');
  kiku.react('hover');
  assert.equal(kiku.tier, 0, 'any sign of the visitor wakes kiku');
  assert.ok(!svg.classes.has('hsk-kiku-asleep'));
  kiku.destroy();
});

test('hover reactions never repeat back to back', () => {
  const { mod, svg, run } = load();
  const kiku = mod.createKiku(svg, () => {}, false, false);
  let last = '';
  for (let i = 0; i < 40; i++) {
    kiku.react('hover');
    assert.notEqual(kiku.act, last);
    assert.match(kiku.act, /^(perk|giggle|shy|hophi)$/);
    last = kiku.act;
    run(50);
  }
  kiku.destroy();
});

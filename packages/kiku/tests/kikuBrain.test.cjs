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

// The fig's uniform scale: the swell multiplies both axes of the squash-and-stretch.
const area = t => { const m = /scale\(([-\d.]+) ([-\d.]+)\)/.exec(t); return m[1] * m[2]; };

test('a swell draws in, grows, settles back, and lights the pill even under reduced motion', () => {
  const { mod, svg, parts, run } = load();
  const kiku = mod.createKiku(svg, () => {}, false, false);
  kiku.setBase('speaking');
  run(2000);
  const fig = parts['.hsk-kiku-fig'][0];
  kiku.react('swell');
  assert.ok(svg.classes.has('hsk-kiku-swellgo'), 'the glow starts at once');
  let peak = 0;
  for (let t = 0; t < 600; t += 16) { run(16); peak = Math.max(peak, area(fig.attrs.transform)); }
  assert.ok(peak > 1.15, 'grows clearly at 34px: ' + peak);
  run(2500);
  assert.ok(Math.abs(area(fig.attrs.transform) - 1) < .04, 'settles back');
  assert.equal(svg.dataset.state, 'speaking', 'a swell never changes the state');
  kiku.destroy();

  const r = load(), still = r.mod.createKiku(r.svg, () => {}, true, false);
  still.react('swell');
  assert.ok(r.svg.classes.has('hsk-kiku-swellgo'), 'reduced motion still gets the glow');
  still.destroy();
});

test('happy and the stop "oh" play over a busy state and hand back to it', () => {
  const { mod, svg, run } = load();
  const kiku = mod.createKiku(svg, () => {}, false, false);
  kiku.setBase('thinking');
  run(300);
  kiku.react('happy');
  assert.equal(kiku.act, 'happy');
  kiku.setBase('idle');
  kiku.react('oh');
  assert.equal(kiku.act, 'oh');
  run(1500);
  assert.equal(svg.dataset.state, 'idle');
  kiku.destroy();
});

test('every state the chat uses has its own pose and runs', () => {
  const { mod, svg, parts, run } = load();
  const kiku = mod.createKiku(svg, () => {}, true, false);
  const seen = new Map();
  for (const s of ['idle', 'welcoming', 'curious', 'guiding', 'visualizing', 'thinking', 'speaking', 'failed', 'listening', 'handoff']) {
    kiku.setBase(s);
    run(4000);
    assert.equal(svg.dataset.state, s);
    const look = ['.hsk-kiku-fig', '.hsk-kiku-face', '.hsk-kiku-smile', '.hsk-kiku-bu', '.hsk-kiku-talk'].map(k => JSON.stringify(parts[k][0].attrs)).join();
    seen.set(look, (seen.get(look) || []).concat(s));
  }
  for (const states of seen.values()) assert.equal(states.length, 1, 'shares a pose: ' + states);
  kiku.destroy();
});

test('typing turns a resting kiku to listen, and it goes back to its state', () => {
  const { mod, svg, run } = load();
  const kiku = mod.createKiku(svg, () => {}, true, false);
  kiku.setBase('guiding');
  kiku.focus(true);
  kiku.typed({ x: 0, y: 0 });
  assert.equal(svg.dataset.state, 'listening');
  kiku.focus(false);
  assert.equal(svg.dataset.state, 'guiding');
  run(100);
  kiku.destroy();
});

test('unread below: kiku swells, stays swollen and glowing through state changes, and lets it out once caught up', () => {
  const { mod, svg, parts, run } = load();
  const kiku = mod.createKiku(svg, () => {}, false, false);
  kiku.setBase('speaking');
  run(2000);
  const fig = parts['.hsk-kiku-fig'][0], lin = () => Math.sqrt(area(fig.attrs.transform));
  kiku.setAlert(true);
  assert.ok(svg.classes.has('hsk-kiku-swollen') && svg.classes.has('hsk-kiku-swellgo'));
  run(3000);
  assert.ok(lin() > 1.05 && lin() < 1.09, 'held gently swollen: ' + lin());
  kiku.setBase('idle');
  run(3000);
  assert.ok(lin() > 1.05, 'still swollen after the reply ends: ' + lin());
  kiku.setAlert(false);
  assert.ok(!svg.classes.has('hsk-kiku-swollen'), 'the glow fades');
  let low = 9;
  for (let t = 0; t < 600; t += 16) { run(16); low = Math.min(low, lin()); }
  assert.ok(low < 1.01, 'deflates, with a small settle past rest: ' + low);
  run(2500);
  assert.ok(Math.abs(lin() - 1) < .02, 'back to its size');
  kiku.destroy();

  const r = load(), still = r.mod.createKiku(r.svg, () => {}, true, false);
  still.setAlert(true);
  r.run(500);
  assert.ok(r.svg.classes.has('hsk-kiku-swollen'), 'reduced motion holds the glow');
  assert.ok(Math.abs(Math.sqrt(area(r.parts['.hsk-kiku-fig'][0].attrs.transform)) - 1) < .01, 'and never scales');
  still.setAlert(false);
  assert.ok(!r.svg.classes.has('hsk-kiku-swollen'));
  still.destroy();
});

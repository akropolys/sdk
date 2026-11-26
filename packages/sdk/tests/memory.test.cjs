const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/memory.ts'), 'utf8');

function load({ local = new Map(), session = new Map(), now = () => 1_000_000, doc } = {}) {
  const store = map => ({ getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) });
  const exports = {};
  const context = {
    exports, localStorage: store(local), sessionStorage: store(session), JSON, Math,
    Date: { now }, URL, location: { href: 'https://shop.example/thanks?order=12#top' }, document: doc,
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { m: exports, local, session };
}

test('memory is a remembered choice per site', () => {
  const { m } = load();
  assert.equal(m.memoryChoice('site'), null);
  m.setMemoryChoice('site', 'off');
  assert.equal(m.memoryChoice('site'), 'off');
  assert.equal(m.memoryChoice('other'), null);
});

test('stored messages keep text and references, never pictures or team messages', () => {
  const { m } = load();
  const stored = m.toStoredMessages([
    { role: 'user', content: '', images: ['data:image/png;base64,AAAA'] },
    { role: 'assistant', content: 'Here', sources: [{ name: 'Mug', image: 'data:image/png;base64,BBBB', url: 'https://s/m' }], visualization: 'https://r2/v.png', thinking: 'secret' },
    { role: 'assistant', content: 'From the team', human: true },
    { role: 'user', content: 'queued', queued: true },
  ]);
  const raw = JSON.stringify(stored);
  assert.equal(stored.length, 2);
  assert.ok(!raw.includes('data:'), raw);
  assert.ok(!raw.includes('visualization') && !raw.includes('thinking') && !raw.includes('From the team'), raw);
  assert.equal(stored[1].sources[0].url, 'https://s/m');
});

test('a return is taken once, by one tab, within the hour', () => {
  let t = 1_000_000;
  const { m, local } = load({ now: () => t });
  m.markReturn('site', 'tok');
  assert.equal(m.returnPending('site', 'tok'), true);
  assert.equal(m.returnPending('site', 'other'), false);
  assert.deepEqual({ ...m.takeReturn('site') }, { token: 'tok' });
  assert.equal(m.takeReturn('site'), null, 'a second tab gets nothing');
  m.markReturn('site');
  t += 3_600_001;
  assert.equal(m.takeReturn('site'), null, 'stale');
  assert.equal(local.size, 0);
});

test('one turn at a time across tabs', () => {
  let t = 5_000;
  const local = new Map();
  const a = load({ local, session: new Map(), now: () => t }).m;
  const b = load({ local, session: new Map(), now: () => t }).m;
  a.holdTurn('site');
  assert.equal(b.turnElsewhere('site'), true);
  assert.equal(a.turnElsewhere('site'), false);
  b.releaseTurn('site');
  assert.equal(b.turnElsewhere('site'), true, 'only the holder releases');
  a.releaseTurn('site');
  assert.equal(b.turnElsewhere('site'), false);
  a.holdTurn('site');
  t += 91_000;
  assert.equal(b.turnElsewhere('site'), false, 'a stuck tab does not block forever');
});

test('the landing page is read as plain capped text', () => {
  const doc = { title: 'Thanks', body: { innerText: 'Order   12\n\n confirmed ' + 'x'.repeat(5000) }, querySelector: () => null };
  const { m } = load({ doc });
  const page = m.returnPage();
  assert.equal(page.url, 'https://shop.example/thanks?order=12');
  assert.equal(page.title, 'Thanks');
  assert.ok(page.text.startsWith('Order 12'));
  assert.equal(page.text.length, 4000);
});

test('a restored chat goes first and nothing is shown twice', () => {
  const { m } = load();
  const restored = [{ role: 'user', content: 'a gift for my son' }, { role: 'assistant', content: 'The Ceramic Mug' }];
  assert.deepEqual([...m.mergeRestored([], restored).map(x => x.content)], ['a gift for my son', 'The Ceramic Mug']);
  const typedEarly = [{ role: 'user', content: 'what did you recommend?' }];
  assert.deepEqual([...m.mergeRestored(typedEarly, restored).map(x => x.content)], ['a gift for my son', 'The Ceramic Mug', 'what did you recommend?']);
  assert.equal(m.mergeRestored(restored, restored).length, 2);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sdk = path.resolve(__dirname, '../../..');
const ts = require(sdk + '/node_modules/typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/utils/leaving.ts'), 'utf8');

function load(choice) {
  const calls = [];
  const fake = {
    armActionReturn: (site, token) => calls.push(['arm', site, token]),
    markReturn: (site, token) => calls.push(['mark', site, token]),
    memoryChoice: () => choice,
  };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, require: () => fake });
  return { noteLeaving: module.exports.noteLeaving, calls };
}

test('a link from a remembered chat can be picked up by another tab', () => {
  const { noteLeaving, calls } = load('on');
  noteLeaving({ api: { siteId: 's' }, getKikuKey: () => 'key' }, 'tok');
  assert.deepEqual(calls, [['arm', 's', 'tok'], ['mark', 's', 'tok']]);
});

test('no memory or no Kiku ID: only this tab watches', () => {
  for (const [choice, key] of [['off', 'key'], [null, 'key'], ['on', undefined]]) {
    const { noteLeaving, calls } = load(choice);
    noteLeaving({ api: { siteId: 's' }, getKikuKey: () => key }, 'tok');
    assert.deepEqual(calls, [['arm', 's', 'tok']]);
  }
});

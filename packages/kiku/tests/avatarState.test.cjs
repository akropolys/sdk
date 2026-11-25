const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const mod = { exports: {} };
const src = fs.readFileSync(path.join(__dirname, '../src/components/ChatModal/avatarState.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports });
const { avatarStateFor } = mod.exports;
const base = { handoff: false, listening: false, busy: false, revealing: false, visibleReply: false, failed: false };
const at = o => avatarStateFor({ ...base, ...o });

test('a turn thinks until the first visible words, speaks while they print, then rests', () => {
  // send: the stream flag is already up, nothing to read yet
  assert.equal(at({ busy: true, revealing: true }), 'thinking');
  // reasoning or tool markup only: still thinking
  assert.equal(at({ busy: true, revealing: true, visibleReply: false }), 'thinking');
  assert.equal(at({ busy: true, revealing: true, visibleReply: true }), 'speaking');
  // stream done, the paced reveal still printing
  assert.equal(at({ revealing: true, visibleReply: true }), 'speaking');
  assert.equal(at({ visibleReply: true }), 'idle');
});

test('an error reply or a broken-off stream fails; nothing else does', () => {
  assert.equal(at({ failed: true }), 'failed');
  assert.equal(at({ failed: true, visibleReply: true }), 'failed');
  // a stale failure gives way once the next turn starts
  assert.equal(at({ failed: true, busy: true }), 'thinking');
});

test('handoff and the visitor speaking come first', () => {
  assert.equal(at({ handoff: true, busy: true, visibleReply: true }), 'handoff');
  assert.equal(at({ listening: true, busy: true }), 'listening');
});

test('a reply that arrived whole but is not typed out yet keeps kiku thinking, never idle', () => {
  assert.equal(avatarStateFor({ handoff: false, listening: false, busy: false, revealing: true, visibleReply: false, failed: false }), 'thinking');
});

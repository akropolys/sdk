const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const mod = { exports: {} };
const src = fs.readFileSync(path.join(__dirname, '../src/components/ChatModal/avatarState.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports });
const { avatarStateFor, afterReply, pleased } = mod.exports;
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

test('an image or video being made shows kiku visualizing, over thinking and speaking', () => {
  assert.equal(at({ visualizing: true, busy: true, revealing: true, visibleReply: true }), 'visualizing');
  assert.equal(at({ visualizing: true }), 'visualizing');
  assert.equal(at({ visualizing: true, handoff: true }), 'handoff');
});

test('an empty chat welcomes; a photo in the box makes kiku curious, even after a failure', () => {
  assert.equal(at({ empty: true }), 'welcoming');
  assert.equal(at({ empty: true, busy: true }), 'thinking');
  assert.equal(at({ attaching: true }), 'curious');
  assert.equal(at({ attaching: true, failed: true }), 'curious');
  assert.equal(at({ attaching: true, busy: true }), 'thinking');
  assert.equal(at({ attaching: true, listening: true }), 'listening');
});

test('after a reply kiku guides to what it showed, or waits on its question, until the next turn', () => {
  assert.equal(at({ after: 'guiding', visibleReply: true }), 'guiding');
  assert.equal(at({ after: 'curious' }), 'curious');
  assert.equal(at({ after: 'guiding', busy: true }), 'thinking');
  assert.equal(at({ after: 'guiding', failed: true }), 'failed');
  assert.equal(afterReply(true, 'Here are three sofas.'), 'guiding');
  assert.equal(afterReply(true, 'Which one do you like?'), 'guiding');
  assert.equal(afterReply(false, 'Which room is it for?  '), 'curious');
  assert.equal(afterReply(false, 'Done.'), null);
});

test('a short thanks or delight is pleased; a longer question is not', () => {
  for (const t of ['thanks!', 'Thank you so much', 'perfect', 'love it 😍', 'merci', '👍']) assert.equal(pleased(t), true, t);
  for (const t of ['what is this?', 'they have no thankfulness', 'Thanks, and can you also compare the delivery times and the return policies of all three sofas for me?'])
    assert.equal(pleased(t), false, t);
});

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const m = {exports: {}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/writing.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {module: m, exports: m.exports});
const {snapReveal} = m.exports;

const ANSWER = 'We have four cheeses, all in stock:\n- **Cheddar Cheese** — 200 g, $4.49. See [the shop](https://x.y/z) now.\n* **Brie**\n2024 was good\n1. item\n## Head';

test('a reveal never stops inside markup, at any stream split', () => {
  for (let n = 1; n <= ANSWER.length; n++) {
    const text = ANSWER.slice(0, n);
    for (let i = 0; i <= n; i++) {
      const shown = text.slice(0, snapReveal(text, i, false));
      const line = shown.slice(shown.lastIndexOf('\n') + 1);
      assert.doesNotMatch(line, /^(?:[-*]|1\.?|##?) ?(?:\*\*?)?$/, `bare marker at ${n}/${i}: ${JSON.stringify(line)}`);
      assert.doesNotMatch(line, /\[[^\]]*$|\]\([^)]*$/, `open link at ${n}/${i}`);
      assert.ok(!/(^|[^*])\*$/.test(shown) || /\* $/.test(shown), `lone star at ${n}/${i}`);
    }
  }
});

test('a reveal moves forward over markup it can finish', () => {
  assert.equal(snapReveal('- **Ch', 3, false), 5);
  assert.equal(snapReveal('ab **cd', 4, false), 5);
  assert.equal(snapReveal('x [ab](cd) y', 6, false), 10);
});

test('a reveal holds before markup that has not arrived', () => {
  assert.equal(snapReveal('- *', 3, false), 0);
  assert.equal(snapReveal('ab *', 4, false), 3);
  assert.equal(snapReveal('x [ab](c', 6, false), 2);
  assert.equal(snapReveal('x\n12', 4, false), 2);
});

test('the end of a reply shows everything', () => {
  assert.equal(snapReveal('ab *', 4, true), 4);
  assert.equal(snapReveal('x [ab](c', 8, true), 8);
  assert.equal(snapReveal('- ', 2, true), 2);
});

const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
function load(file, modules) {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils', file), 'utf8');
  const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true}}).outputText;
  const mod = {exports: {}};
  vm.runInNewContext(js, {module: mod, exports: mod.exports, URL, performance, require: name => modules[name] ?? require(name)});
  return mod.exports;
}
const md = load('markdown.tsx', {react: React, './textDirection': load('textDirection.ts', {}), './writing': m.exports});
const draw = (text, store, names) => renderToStaticMarkup(React.createElement(React.Fragment, null, md.renderMarkdown(text, true, undefined, names, store)));

test('bold still being written shows as bold, never as stars', () => {
  for (let n = 1; n <= ANSWER.length; n++) {
    const shown = ANSWER.slice(0, snapReveal(ANSWER, n, false));
    const out = draw(shown, md.createWriting(true), ['Cheddar Cheese']);
    assert.doesNotMatch(out.replace(/<[^>]+>/g, ''), /\*\*|`/, `stars at ${n}`);
  }
  assert.match(draw('- **Ched', md.createWriting(false)), /<strong>Ched<\/strong>/);
});

test('new words enter softly and earlier lines are reused', () => {
  const store = md.createWriting(true);
  const first = draw('Hello there\nNext', store);
  assert.match(first, /class="hsk-fx"/);
  const cachedLine = store.cache.get(0).node;
  draw('Hello there\nNext line', store);
  assert.equal(store.cache.get(0).node, cachedLine);
});

test('a reply already on screen does not animate again', () => {
  const out = draw('- **Cheddar Cheese** is sharp', md.createWriting(false), ['Cheddar Cheese']);
  assert.doesNotMatch(out, /hsk-fx|hsk-li-in|hsk-entity-name--in/);
  assert.match(out, /<span class="hsk-entity-name">Cheddar Cheese<\/span>/);
});

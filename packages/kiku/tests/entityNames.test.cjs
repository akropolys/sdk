const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');

// markdown.tsx with its one local import (textDirection) loaded the same way.
function load(file, modules) {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils', file), 'utf8');
  const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true}}).outputText;
  const m = {exports: {}};
  vm.runInNewContext(js, {module: m, exports: m.exports, URL, require: name => modules[name] ?? require(name)});
  return m.exports;
}
const textDirection = load('textDirection.ts', {});
const {renderMarkdown} = load('markdown.tsx', {react: React, './textDirection': textDirection});
const html = (text, names) => renderToStaticMarkup(React.createElement(React.Fragment, null, renderMarkdown(text, false, undefined, names)));

test('the thing being discussed gets a faint pill in the answer text', () => {
  const out = html('Sea Luxury is a 12-bedroom estate in Corolla.', ['Sea Luxury']);
  assert.match(out, /<span class="hsk-entity-name">Sea Luxury<\/span> is a 12-bedroom estate/);
});

test('only whole names are marked, and the longest name wins', () => {
  const out = html('Ocean Grandeur Suite beats Ocean, and Oceanside is a town.', ['Ocean', 'Ocean Grandeur Suite']);
  assert.match(out, /<span class="hsk-entity-name">Ocean Grandeur Suite<\/span> beats <span class="hsk-entity-name">Ocean<\/span>, and Oceanside/);
});

test('without product names the answer is unchanged', () => {
  assert.doesNotMatch(html('Sea Luxury is lovely.', []), /hsk-entity-name/);
});

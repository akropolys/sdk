const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load({ fail = false } = {}) {
  const draws = [], formats = [], module = { exports: {} };
  const canvas = { getContext: () => ({ fillStyle: '', fillRect() { draws.push('white'); }, drawImage() { draws.push('image'); } }), toBlob(done, mime) { formats.push(mime); done({ size: 150, type: mime }); } };
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/utils/downscaleImage.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, createImageBitmap: async () => { if (fail) throw Error('decode failed'); return { width: 4000, height: 2000, close() {} }; }, document: { createElement: () => canvas }, FileReader: class { readAsDataURL(blob) { this.result = 'data:' + blob.type + ';base64,encoded'; this.onload(); } } });
  return { downscale: module.exports.downscaleImage, canvas, draws, formats };
}

test('voice converts even a small unsupported image to bounded JPEG pixels', async () => {
  const h = load();
  const output = await h.downscale({ type: 'image/svg+xml', size: 100 }, 'image/jpeg');
  assert.equal(output, 'data:image/jpeg;base64,encoded');
  assert.equal(h.canvas.width, 1536); assert.equal(h.canvas.height, 768);
  assert.deepEqual(h.draws, ['white', 'image']); assert.deepEqual(h.formats, ['image/jpeg']);
});

test('ordinary small images keep their existing upload behavior', async () => {
  const h = load();
  assert.equal(await h.downscale({ type: 'image/png', size: 100 }), 'data:image/png;base64,encoded');
  assert.equal(h.formats.length, 0);
});

test('failed voice conversion cannot forward an unsupported original', async () => {
  const h = load({ fail: true });
  await assert.rejects(h.downscale({ type: 'image/svg+xml', size: 100 }, 'image/jpeg'));
});

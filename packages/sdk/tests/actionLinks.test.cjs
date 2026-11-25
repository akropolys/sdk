const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const target = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/actionLinks.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: target, exports: target.exports, Map });
const { actionLinkContexts } = target.exports;
const result = response => ({ status: 'sent', httpStatus: 200, response });

test('verified action results supply currency, amount and optional merchant identity', () => {
  const links = actionLinkContexts(result({ checkout_url: 'https://pay.example/session#secret', total_cents: 17100, currency: 'usd', merchant: { name: 'My Shop', logo_url: 'https://shop.example/logo.png' } }));
  assert.equal(links.length, 1);
  assert.equal(links[0].amount, 171);
  assert.equal(links[0].currency, 'USD');
  assert.equal(links[0].title, 'My Shop');
  assert.equal(links[0].logo, 'https://shop.example/logo.png');
});

test('failed actions do not generate a destination or a success amount', () => {
  for (const response of [{ status: 'failed', httpStatus: 400 }, { status: 'needs_sign_in', httpStatus: 401 }, { status: 'sent' }]) {
    assert.equal(actionLinkContexts({ ...response, response: { url: 'https://pay.example', amount: 171, currency: 'USD' } }).length, 0);
  }
});

test('details remain attached to their own nested response and image URLs are excluded', () => {
  const links = actionLinkContexts(result({ results: [{ url: 'https://a.example', amount: 10, currency: 'USD', image_url: 'https://img.example/a.png' }, { url: 'https://b.example', title: 'Video' }] }));
  assert.equal(links.length, 2);
  assert.equal(links[0].amount, 10);
  assert.equal(links[1].amount, undefined);
});

test('amounts without a currency and non-finite values are never formatted as money', () => {
  for (const response of [{ url: 'https://a.example', total_cents: 1000 }, { url: 'https://a.example', amount: Infinity, currency: 'USD' }]) assert.equal(actionLinkContexts(result(response))[0].amount, undefined);
});

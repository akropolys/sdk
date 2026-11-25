const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const target = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/externalLinks.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: target, exports: target.exports, URL, Map });
const { extractExternalLinks, externalLink } = target.exports;
const base = 'https://shop.example/products';
const checkout = 'https://checkout.stripe.com/c/pay/session#token%2Fsecret';

test('a long signed destination stays exact in its card and out of the answer', () => {
  const result = extractExternalLinks(`Ready.\n\n**${checkout}**\n\nPayment is completed on Stripe.`, base, [{ url: checkout, title: 'My Shop', amount: 171, currency: 'USD' }]);
  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].url, checkout);
  assert.equal(result.links[0].title, 'My Shop');
  assert.equal(result.links[0].amount, 171);
  assert.equal(result.links[0].favicon, 'https://checkout.stripe.com/favicon.ico');
  assert.equal(result.content.includes('secret'), false);
  assert.equal(result.content.includes('**'), false);
  assert.match(result.content, /Payment is completed on Stripe/);
});

test('Kiku link labels are preserved, deduplicated and not inferred from URL tokens', () => {
  const result = extractExternalLinks(`[Payer maintenant](${checkout})\n${checkout}`, base);
  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].label, 'Payer maintenant');
  assert.equal(result.content, '');
});

test('email, Gmail, Slack, M-Pesa and YouTube all use the same link path', () => {
  for (const [url, service] of [
    ['mailto:hello@example.com?subject=Hello', 'email'],
    ['https://mail.google.com/mail/u/0/#inbox', 'gmail'],
    ['slack://channel?team=T1&id=C1', 'slack'],
    ['https://workspace.slack.com/archives/C1', 'slack'],
    ['https://www.safaricom.co.ke/mpesa', 'mpesa'],
    ['https://youtu.be/abc123', 'youtube'],
  ]) assert.equal(externalLink(url, base).service, service);
  assert.equal(externalLink('https://youtube.com.evil.example/video', base).service, undefined);
});

test('local navigation, image markdown and code examples retain their original meaning', () => {
  for (const text of ['[Your cart](/cart)', '![Photo](https://images.example/photo.jpg)', '`https://api.example/endpoint`', '```js\nfetch("https://api.example");\n```']) {
    const result = extractExternalLinks(text, base);
    assert.equal(result.links.length, 0);
    assert.equal(result.content, text);
  }
});

test('unsafe schemes, credentials and literal control characters never become cards', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.com', 'https://example.com/\nsecret', 'file:///etc/passwd']) assert.equal(externalLink(url, base), undefined);
});

test('streaming never exposes a partial URL or enables an incomplete destination', () => {
  for (const full of [checkout, `[Continue to checkout](${checkout})`]) {
    for (let i = 1; i <= full.length; i++) {
      const result = extractExternalLinks(full.slice(0, i), base, [], true);
      assert.equal(result.links.length, 0);
      assert.equal(result.content.includes('https://'), false, `split ${i}: ${result.content}`);
    }
  }
});

test('a verified action destination appears even when the reply omits its URL', () => {
  const result = extractExternalLinks('Your checkout is ready.', base, [{ url: checkout, amount: 171, currency: 'USD' }]);
  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].url, checkout);
  assert.equal(result.links[0].amount, 171);
  assert.equal(result.content, 'Your checkout is ready.');
  assert.equal(extractExternalLinks('Your checkout is ready.', base, [{ url: checkout }], true).links.length, 0);
});

test('action-result fallback preserves URL validation and does not duplicate a narrated link', () => {
  const contexts = [{ url: checkout }, { url: 'javascript:alert(1)' }, { url: 'https://shop.example/cart' }];
  const result = extractExternalLinks(`[Continue](${checkout})`, base, contexts);
  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].label, 'Continue');
});


test('verified checkout replaces an incomplete or invented Stripe link without losing details', () => {
  const partial = checkout.split('#')[0];
  const result = extractExternalLinks(`[Continue to checkout](${partial})`, base, [{ url: checkout, returnToken: 'return-token', amount: 24, currency: 'USD' }]);
  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].url, checkout);
  assert.equal(result.links[0].returnToken, 'return-token');
  assert.equal(result.links[0].amount, 24);
  assert.equal(result.content.includes(partial), false);
});

test('independently verified checkout destinations remain separate', () => {
  const second = 'https://checkout.stripe.com/c/pay/another#another-token';
  const result = extractExternalLinks('Choose a checkout.', base, [{ url: checkout }, { url: second }]);
  assert.equal(result.links.length, 2);
  assert.deepEqual(Array.from(result.links, link => link.url), [checkout, second]);
});


test('complete action links are preserved across external services', () => {
  for (const [full, partial] of [
    ['https://example.com/pay?id=123&signature=abc', 'https://example.com/pay?id=123'],
    ['https://workspace.slack.com/archives/C1#message-123', 'https://workspace.slack.com/archives/C1'],
    ['https://youtu.be/abc123?token=xyz', 'https://youtu.be/abc123'],
    ['mailto:hello@example.com?subject=Hello', 'mailto:hello@example.com'],
  ]) {
    const result = extractExternalLinks(`[Open](${partial})`, base, [{ url: full, returnToken: 'ticket' }]);
    assert.equal(result.links.length, 1, full);
    assert.equal(result.links[0].url, full);
    assert.equal(result.links[0].returnToken, 'ticket');
    assert.equal(result.links[0].label, 'Open');
  }
});

test('separate external destinations are not discarded', () => {
  const first = 'https://example.com/items/one?token=123';
  const other = 'https://example.com/items/two';
  const result = extractExternalLinks(`[Other](${other})`, base, [{ url: first }]);
  assert.equal(result.links.length, 2);
  assert.deepEqual(Array.from(result.links, link => link.url), [other, first]);
});

test('an ambiguous short link does not replace separate verified destinations', () => {
  const one = 'https://example.com/checkout?token=one';
  const two = 'https://example.com/checkout?token=two';
  const result = extractExternalLinks('[Continue](https://example.com/checkout)', base, [{url: one}, {url: two}]);
  assert.deepEqual(Array.from(result.links, link => link.url), [one, two]);
});

test('a link inside a sentence keeps its words; one on its own line becomes only a card', () => {
  const inline = extractExternalLinks('Read [our sizing guide](https://brand.example/size) before ordering, or see https://youtu.be/abc.', base);
  assert.equal(inline.content, 'Read our sizing guide before ordering, or see YouTube.');
  assert.equal(inline.links.length, 2);
  const alone = extractExternalLinks('Here it is:\n\n[Sizing guide](https://brand.example/size)\n', base);
  assert.equal(alone.content, 'Here it is:');
  assert.equal(alone.links[0].label, 'Sizing guide');
});

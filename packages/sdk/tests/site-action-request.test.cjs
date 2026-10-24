const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AkropolysAPI } = require('../dist/index.js');

test('chat preserves shopper authorization and language settings without a browser cart snapshot', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/site-widget?siteId=site')) {
      return Response.json({ identityUrl: 'https://shop.example/api/identity' });
    }
    if (url === 'https://shop.example/api/identity') {
      return Response.json({ token: 'shopper-token' });
    }
    assert.equal(url, 'https://api.example/chat/stream');
    return new Response('event: done\ndata: {}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  });
  const api = new AkropolysAPI(
    'https://api.example', 'site', 'public-token',
    () => 'customer-1', () => 'session-1', () => 'device-1',
    () => 'public-key', () => 'Peter', () => 'ur', () => 'original', () => 'memory-key'
  );
  api.userProof = 'signed-proof';
  await api.chatStream('Add two linen chairs');
  const identity = calls.find(call => call.url === 'https://shop.example/api/identity');
  assert.equal(identity.options.credentials, 'include');
  const request = calls.find(call => call.url.endsWith('/chat/stream')).options;
  const body = JSON.parse(request.body);
  assert.equal(body.shopperName, 'Peter');
  assert.equal(body.shopperLanguage, 'ur');
  assert.equal(body.entityLanguageMode, 'original');
  assert.equal(Object.hasOwn(body, 'cart'), false);
  assert.equal(request.headers['X-Akropolys-Shopper-Auth'], 'Bearer shopper-token');
  assert.equal(request.headers['X-Akropolys-Shopper-Id'], 'customer-1');
  assert.equal(request.headers['X-Akropolys-Shopper-Proof'], 'signed-proof');
  assert.equal(request.headers['X-Akropolys-Session-Id'], 'session-1');
  assert.equal(request.headers['X-Akropolys-Device-Id'], 'device-1');
  assert.equal(request.headers['X-Akropolys-Kiku-Key'], 'memory-key');
});

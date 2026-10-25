const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AkropolysAPI } = require('../dist/index.js');

test('chat uses browser actions without fetching an identity token and preserves shopper proof', async t => {
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
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example/chat/stream');
  const request = calls.find(call => call.url.endsWith('/chat/stream')).options;
  const body = JSON.parse(request.body);
  assert.equal(body.shopperName, 'Peter');
  assert.equal(body.shopperLanguage, 'ur');
  assert.equal(body.entityLanguageMode, 'original');
  assert.equal(Object.hasOwn(body, 'cart'), false);
  assert.equal(request.headers['X-Akropolys-Shopper-Auth'], undefined);
  assert.equal(request.headers['X-Akropolys-Shopper-Id'], 'customer-1');
  assert.equal(request.headers['X-Akropolys-Shopper-Proof'], 'signed-proof');
  assert.equal(request.headers['X-Akropolys-Session-Id'], 'session-1');
  assert.equal(request.headers['X-Akropolys-Device-Id'], 'device-1');
  assert.equal(request.headers['X-Akropolys-Kiku-Key'], 'memory-key');
});


test('voice can reuse the site identity endpoint with cancellation', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (url.endsWith('/site-widget?siteId=site')) return Response.json({ identityUrl: 'https://shop.example/identity' });
    assert.equal(url, 'https://shop.example/identity');
    assert.equal(options.signal, controller.signal);
    assert.equal(options.credentials, 'include');
    return Response.json({ authorization: 'Bearer signed-in-visitor' });
  });
  const api = new AkropolysAPI('https://api.example', 'site', 'public-token');
  assert.equal(await api.getShopperAuth(controller.signal), 'Bearer signed-in-visitor');
});

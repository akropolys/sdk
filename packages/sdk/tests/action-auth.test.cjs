const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AkropolysAPI, executeBrowserAction } = require('../dist/index.js');

const action = { name: 'update_cart', url: '/api/cart', method: 'PATCH', body: { quantity: 2 }, requiresSignIn: true };
function browser(t) {
  const previous = globalThis.window;
  globalThis.window = { location: { href: 'https://shop.example/products/1' } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return Response.json({ updated: true });
  });
  return requests;
}

test('Clerk client uses its current session and refreshed token without retaining it after logout', async t => {
  const requests = browser(t);
  let token = 'clerk-token-1';
  const clerk = { session: { async getToken(options) { assert.deepEqual(options, { template: 'shop' }); return token; } } };
  const auth = { provider: 'clerk', client: clerk, tokenOptions: { template: 'shop' } };
  assert.equal((await executeBrowserAction(action, undefined, undefined, auth)).status, 'sent');
  token = 'clerk-token-2';
  await executeBrowserAction(action, undefined, undefined, auth);
  assert.deepEqual(requests.map(r => r.options.headers.get('Authorization')), ['Bearer clerk-token-1', 'Bearer clerk-token-2']);
  clerk.session = null;
  assert.equal((await executeBrowserAction(action, undefined, undefined, auth)).status, 'needs_sign_in');
  assert.equal(requests.length, 2);
});

test('Clerk React auth and Auth0 React auth are supported without header callbacks', async t => {
  const requests = browser(t);
  await executeBrowserAction(action, undefined, undefined, { provider: 'clerk', client: { isLoaded: true, isSignedIn: true, async getToken() { return 'clerk-react'; } } });
  await executeBrowserAction(action, undefined, undefined, { provider: 'auth0', client: { isAuthenticated: true, async getAccessTokenSilently() { return 'auth0-react'; } } });
  assert.deepEqual(requests.map(r => r.options.headers.get('Authorization')), ['Bearer clerk-react', 'Bearer auth0-react']);
});

test('Auth0 SPA adapter delegates token renewal, preserves API parameters and handles expired sessions', async t => {
  const requests = browser(t);
  let signedIn = true, version = 0;
  const client = { async getTokenSilently(options) {
    assert.deepEqual(options, { authorizationParams: { audience: 'https://api.shop.example', scope: 'cart:write' } });
    if (!signedIn) throw { error: 'login_required', error_description: 'sensitive provider detail' };
    return 'auth0-' + ++version;
  } };
  const auth = { provider: 'auth0', client, authorizationParams: { audience: 'https://api.shop.example', scope: 'cart:write' } };
  await executeBrowserAction(action, undefined, undefined, auth);
  await executeBrowserAction(action, undefined, undefined, auth);
  assert.deepEqual(requests.map(r => r.options.headers.get('Authorization')), ['Bearer auth0-1', 'Bearer auth0-2']);
  signedIn = false;
  const result = await executeBrowserAction(action, undefined, undefined, auth);
  assert.equal(result.status, 'needs_sign_in');
  assert.equal(result.httpStatus, 401);
  assert.equal(requests.length, 2);
  assert(!JSON.stringify(result).includes('sensitive provider detail'));
});

test('Supabase reads the current session per action, follows token refresh and permits guest actions after logout', async t => {
  const requests = browser(t);
  let session = { access_token: 'supabase-1' };
  const auth = { provider: 'supabase', client: { auth: { async getSession() { return { data: { session }, error: null }; } } } };
  await executeBrowserAction(action, undefined, undefined, auth);
  session = { access_token: 'supabase-2' };
  await executeBrowserAction(action, undefined, undefined, auth);
  session = null;
  assert.equal((await executeBrowserAction(action, undefined, undefined, auth)).status, 'needs_sign_in');
  assert.equal(requests.length, 2);
  await executeBrowserAction({ ...action, requiresSignIn: false }, undefined, undefined, auth);
  assert.equal(requests[2].options.headers.get('Authorization'), null);
  assert.equal(requests[2].options.credentials, 'include');
});

test('provider failures and loading states block calls without exposing provider errors', async t => {
  const requests = browser(t);
  const failed = await executeBrowserAction(action, undefined, undefined, { provider: 'supabase', client: { auth: { async getSession() { return { data: { session: null }, error: new Error('private-refresh-token') }; } } } });
  assert.equal(failed.status, 'failed');
  assert(!JSON.stringify(failed).includes('private-refresh-token'));
  const loading = await executeBrowserAction(action, undefined, undefined, { provider: 'clerk', client: { isLoaded: false, async getToken() { throw Error('must not run'); } } });
  assert.equal(loading.status, 'failed');
  assert.equal(requests.length, 0);
});

test('tokens are restricted to trusted API origins and CSRF headers can be supplied separately', async t => {
  const requests = browser(t);
  let reads = 0;
  const auth = { provider: 'clerk', client: { async getToken() { reads++; return 'private'; } } };
  const foreign = { ...action, url: 'https://api.shop.example/cart' };
  assert.equal((await executeBrowserAction(foreign, undefined, undefined, auth)).status, 'failed');
  assert.equal(reads, 0);
  assert.equal(requests.length, 0);
  auth.origins = ['https://api.shop.example'];
  await executeBrowserAction(foreign, undefined, () => ({ 'X-CSRF-Token': 'csrf' }), auth);
  assert.equal(requests[0].options.headers.get('Authorization'), 'Bearer private');
  assert.equal(requests[0].options.headers.get('X-CSRF-Token'), 'csrf');
  const conflict = await executeBrowserAction(foreign, undefined, () => ({ Authorization: 'Bearer custom' }), auth);
  assert.equal(conflict.status, 'failed');
  assert.equal(requests.length, 1);
});

test('an invalidated Clerk session and cancelled token retrieval never dispatch an action', async t => {
  const requests = browser(t);
  let finish;
  const clerk = { session: { getToken: () => new Promise(resolve => { finish = resolve; }) } };
  const waiting = executeBrowserAction(action, undefined, undefined, { provider: 'clerk', client: clerk });
  await new Promise(resolve => setImmediate(resolve));
  clerk.session = null;
  finish('old-session-token');
  assert.equal((await waiting).status, 'needs_sign_in');
  const controller = new AbortController();
  const aborted = executeBrowserAction(action, controller.signal, undefined, { provider: 'auth0', client: { getTokenSilently: () => new Promise(() => {}) } });
  controller.abort();
  assert.equal((await aborted).status, 'failed');
  assert.equal(requests.length, 0);
});

test('HTTP 401 never retries an action mutation and cookies need no provider configuration', async t => {
  const requests = browser(t);
  t.mock.method(globalThis, 'fetch', async (url, options) => { requests.push({ url, options }); return Response.json({ error: 'Expired token' }, { status: 401 }); });
  const api = new AkropolysAPI('https://platform.example', 'site', 'public-key');
  api.actionAuth = { provider: 'supabase', client: { auth: { async getSession() { return { data: { session: { access_token: 'expired' } } }; } } } };
  assert.equal((await api.executeBrowserAction(action)).status, 'needs_sign_in');
  assert.equal(requests.length, 1);
  delete api.actionAuth;
  await api.executeBrowserAction(action);
  assert.equal(requests[1].options.headers.has('Authorization'), false);
  assert.equal(requests[1].options.credentials, 'include');
});

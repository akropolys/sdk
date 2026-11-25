const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sdk = require('../dist/index.js');

function storage() {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k), key: i => [...values.keys()][i] ?? null, get length() { return values.size; } };
}
function browser(t) {
  const previous = {};
  for (const key of ['window','localStorage','sessionStorage','document','navigator','location','history','requestIdleCallback','fetch','WebSocket']) previous[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  const localStorage = storage(), sessionStorage = storage();
  const location = {href:'https://shop.example/product', origin:'https://shop.example'};
  Object.assign(globalThis, {localStorage, sessionStorage, location,
    window:{localStorage, sessionStorage, location, addEventListener(){}, removeEventListener(){}, requestIdleCallback(){}},
    document:{cookie:'', title:'Shop'}, history:{pushState(){}, replaceState(){}}, requestIdleCallback(){} });
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
  t.after(() => { for (const [key, desc] of Object.entries(previous)) { if (desc) Object.defineProperty(globalThis,key,desc); else delete globalThis[key]; } });
  return {localStorage,sessionStorage};
}
const config = (site, token = 'key-' + site) => ({siteId:site,apiUrl:'https://api.example/v1',apiToken:token});

test('sign-out clears every identity source, active conversation and outstanding streams', async t => {
  const {localStorage,sessionStorage} = browser(t);
  let abortSignal;
  globalThis.fetch = async (_url, opts) => {
    abortSignal = opts.signal;
    return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  };
  const c = new sdk.AkropolysClient(config('a'));
  c.setKikuKey('shopper-secret'); c.setKikuPub('public');
  localStorage.setItem('kiku_key','legacy-secret'); sessionStorage.setItem('kiku_key','legacy-secret');
  c.api.openConversation('request','conversation-token');
  const stream = c.api.conversationEvents(() => {}, new AbortController().signal).catch(() => 0);
  c.clearKikuKey();
  await stream;
  assert.equal(abortSignal.aborted,true);
  assert.equal(c.getKikuKey(),undefined); assert.equal(c.hasKikuKey(),false);
  assert.equal(c.api.conversation,null);
  for (const key of ['akropolys_kiku_key','kiku_key']) { assert.equal(localStorage.getItem(key),null); assert.equal(sessionStorage.getItem(key),null); }
  assert.equal(localStorage.getItem('akropolys_conversation_a'),null);
  const restored = new sdk.AkropolysClient(config('a'));
  assert.equal(restored.getKikuKey(),undefined); assert.equal(restored.api.conversation,null);
  c.destroy(); restored.destroy();
});

test('a pending resume cannot restore a conversation after sign-out', async t => {
  browser(t); let respond;
  globalThis.fetch = () => new Promise(resolve => { respond = resolve; });
  const c = new sdk.AkropolysClient(config('a'));
  c.setKikuKey('secret');
  const pending = c.api.resumeRequest('request');
  c.clearKikuKey();
  respond(Response.json({token:'old-token',lastMessageId:2}));
  assert.equal(await pending,null); assert.equal(c.api.conversation,null);
  c.destroy();
});

test('sign-out discards a pending list response and cancels an active chat', async t => {
  browser(t); let listResponse, contextResponse, fetches = 0;
  globalThis.fetch = () => { fetches++; return new Promise(resolve => { listResponse = resolve; }); };
  const c = new sdk.AkropolysClient(config('a'));
  c.setKikuKey('secret');
  const pendingList = c.api.myRequests();
  c.registerContextProvider(() => new Promise(resolve => { contextResponse = resolve; }));
  c.chat('hello');
  c.clearKikuKey();
  listResponse(Response.json({requests:[{id:'old'}]}));
  contextResponse({});
  assert.deepEqual(await pendingList, []);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetches,1,'an aborted chat must not begin a request later');
  c.destroy();
});

test('a stale widget response cannot install the previous site identity URL', async t => {
  browser(t); const responses = [];
  globalThis.fetch = () => new Promise(resolve => responses.push(resolve));
  const c = new sdk.AkropolysClient(config('a'));
  const old = c.api.widgetSettings();
  c.updateConfig(config('b'));
  const current = c.api.widgetSettings();
  responses[1](Response.json({identityUrl:'https://b.example/identity',cardFields:['b']}));
  assert.equal((await current).identityUrl,'https://b.example/identity');
  responses[0](Response.json({identityUrl:'https://a.example/identity',cardFields:['a']}));
  assert.equal((await old).identityUrl,'');
  assert.deepEqual(c.api.cardFields,['b']);
  assert.equal((await c.api.widgetSettings()).identityUrl,'https://b.example/identity');
  c.destroy();
});

test('queued entity and page writes retain their original site and token after a site switch', async t => {
  browser(t); const sent = [];
  globalThis.fetch = async (url, opts) => {sent.push({url,headers:opts.headers,body:JSON.parse(opts.body)}); return Response.json({success:true});};
  const c = new sdk.AkropolysClient(config('a'));
  await c.ingest({id:'same', title:'A'});
  await c.queueContentIngest({url:'https://shop.example/a',title:'A',text:'text',capturedAt:1});
  c.updateConfig(config('b'));
  await c.ingest({id:'same', title:'A'});
  await c.flushQueue(); await c.flushContentQueue();
  assert.equal(sent.length,3);
  assert.deepEqual(sent.map(x=>x.headers['X-Akropolys-Site']),['a','b','a']);
  assert.deepEqual(sent.map(x=>x.headers['X-Akropolys-Token']),['key-a','key-b','key-a']);
  c.destroy();
});

test('site streams isolate same-name values and their timestamps', t => {
  browser(t); const sockets=[];
  globalThis.WebSocket = class {constructor(url){this.url=url;sockets.push(this)} close(){}};
  const a = new sdk.AkropolysClient(config('a')), b = new sdk.AkropolysClient(config('b'));
  const stopA = sdk.subscribeLiveStream({client:a}), stopB = sdk.subscribeLiveStream({client:b});
  sockets[0].onmessage({data:JSON.stringify({records:[{key:'price',fields:{v:'A'},at:10}]})});
  sockets[1].onmessage({data:JSON.stringify({records:[{key:'price',fields:{v:'B'},at:20}]})});
  a.reRegister(); assert.equal(sdk.getLiveValue('price').fields.v,'A');
  b.reRegister(); assert.equal(sdk.getLiveValue('price').fields.v,'B');
  sockets[0].onmessage({data:JSON.stringify({records:[{key:'price',fields:{v:'A2'},at:11}]})});
  a.reRegister(); assert.equal(sdk.getLiveValue('price').fields.v,'A2');
  assert.equal(['price'].map(sdk.getLiveValue)[0].fields.v,'A2');
  b.reRegister(); assert.equal(sdk.getLiveValue('price').fields.v,'B');
  stopA(); stopB(); a.destroy(); b.destroy(); sdk.clearLiveValues();
});

test('provider forwards a supplied key and enables content indexing without loading a previous public id', t => {
  const {localStorage,sessionStorage} = browser(t);
  localStorage.setItem('akropolys_kiku_key','old-secret'); sessionStorage.setItem('akropolys_kiku_pub','old-public');
  localStorage.setItem('akropolys_conversation_a', JSON.stringify({id:'old',token:'old-token',cursor:0}));
  let client;
  function Reader(){ client=sdk.useAkropolysContext(); return null; }
  renderToStaticMarkup(React.createElement(sdk.AkropolysProvider,{...config('a'),kikuKey:'new-secret',indexContent:true},React.createElement(Reader)));
  assert.equal(client.getKikuKey(),'new-secret'); assert.equal(client.getKikuPub(),undefined);
  assert.equal(client.api.conversation,null);
  assert.equal(localStorage.getItem('akropolys_kiku_key'),'new-secret');
  assert.equal(typeof client.contentIndexerCleanup,'function'); client.destroy();
});

test('page-ingest effect uses its provider client instead of the global client', () => {
  const source = fs.readFileSync(path.join(__dirname,'../src/hooks/usePageIngest.ts'),'utf8');
  const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const seen=[]; const provider={api:{siteId:'a',apiUrl:'url'}, queueIngest:async item=>seen.push(item.id)};
  const module={exports:{}};
  const requireMock = name => name === 'react' ? {useEffect: fn => fn()} : name === '../Provider' ? {useAkropolysContext:()=>provider} : name === '../utils/stableStringify' ? {stableStringify:JSON.stringify} : (()=>{throw Error(name)})();
  vm.runInNewContext(js,{module,exports:module.exports,require:requireMock,console});
  module.exports.usePageIngest({id:'site-a-record'});
  assert.deepEqual(seen,['site-a-record']);
});

test('live publishing and context hooks use their provider client', () => {
  const calls=[];
  const provider={api:{siteId:'a',apiUrl:'url'},registerContextProvider: fn => {calls.push(['context',fn]); return () => {}}};
  const react={useEffect: fn => fn(),useRef: value => ({current:value}),useState: value => [value,()=>{}],useCallback: fn => fn};
  function load(file) {
    const source=fs.readFileSync(path.join(__dirname,'../src/hooks',file+'.ts'),'utf8');
    const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    const module={exports:{}};
    const requireMock = name => name==='react' ? react : name==='../Provider' ? {useAkropolysContext:()=>provider}
      : name==='../liveIngest' ? {pipeLiveData:(_record,_options,client)=>calls.push(['publish',client])}
      : (()=>{throw Error(name)})();
    vm.runInNewContext(js,{module,exports:module.exports,require:requireMock,console});
    return module.exports;
  }
  load('useLiveContext').useLiveContext(async()=>({}));
  load('useLiveData').useLiveData('price',{value:1});
  assert.equal(calls[0][0],'context');
  assert.equal(calls[1][0],'publish'); assert.equal(calls[1][1],provider);
});

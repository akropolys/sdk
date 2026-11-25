// A site starts from one key: the site ID rides in it, and the public key ID
// is worked out from the private key. Old keys with explicit values still work.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,createHash}=require('node:crypto');
const {createIngestClient,signed,signUser,siteFromKey,kidFromPrivateKey}=require('../dist/server.js');

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const pem=privateKey.export({type:'pkcs8',format:'pem'});
// The backend's rule: pk_<kind>_ + first 12 hex of sha256(SPKI DER).
const expectedKid=kind=>`pk_${kind}_`+createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex').slice(0,12);
const key='sk_live_abc_def.'+Buffer.from('kankan-shop').toString('base64url');

test('site comes from the key; old keys have none',()=>{
 assert.equal(siteFromKey(key),'kankan-shop');
 assert.equal(siteFromKey('sk_live_abc_def'),'');
 assert.equal(siteFromKey('not-a-key.a2Fua2Fu'),'');
});

test('key ID is worked out from the private key',async()=>{
 assert.equal(await kidFromPrivateKey(pem,key),expectedKid('live'));
 assert.equal(await kidFromPrivateKey(pem,'sk_test_x'),expectedKid('test'));
 await assert.rejects(kidFromPrivateKey(pem,''),/apiToken/);
});

test('signed ingest needs only the key and the private key',async()=>{
 const calls=[];
 const realFetch=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{calls.push({url,headers:init.headers,body:JSON.parse(init.body)});return new Response(JSON.stringify({success:true,count:1}),{status:200});};
 try{
  const client=createIngestClient({apiToken:key,privateKey:pem});
  await client.ingestBatch([{id:'1',title:'Sofa'}],signed);
  assert.equal(calls[0].headers['X-Akropolys-Site'],'kankan-shop');
  assert.equal(calls[0].body.siteId,'kankan-shop');
  assert.equal(calls[0].body.envelope.kid,expectedKid('live'));
  // Explicit values still win, as old integrations pass them.
  const old=createIngestClient({siteId:'legacy',apiToken:'sk_live_old',privateKey:pem,kid:'pk_live_given'});
  await old.ingestBatch([{id:'1',title:'Sofa'}],signed);
  assert.equal(calls[1].headers['X-Akropolys-Site'],'legacy');
  assert.equal(calls[1].body.envelope.kid,'pk_live_given');
 }finally{globalThis.fetch=realFetch;}
});

test('shopper proof needs only the key and the private key',async()=>{
 const proof=await signUser('42',pem,{apiToken:key});
 const payload=JSON.parse(Buffer.from(proof.split('.')[0],'base64url').toString());
 assert.equal(payload.siteId,'kankan-shop');
 assert.equal(payload.kid,expectedKid('live'));
 assert.equal(payload.shopperId,'42');
 await assert.rejects(signUser('42',pem,{apiToken:'sk_live_old'}),/siteId/);
});

test('a stale siteId next to a site-carrying key is called out',()=>{
 const warnings=[];const orig=console.warn;console.warn=m=>warnings.push(String(m));
 try{
  createIngestClient({siteId:'old-site',apiToken:key});
  createIngestClient({siteId:'kankan-shop',apiToken:key});
 }finally{console.warn=orig;}
 assert.equal(warnings.length,1);
 assert.match(warnings[0],/old-site.*kankan-shop/);
});

test('a PKCS#1 key gets a plain explanation',async()=>{
 const pkcs1=privateKey.export({type:'pkcs1',format:'pem'});
 await assert.rejects(kidFromPrivateKey(pkcs1,key),/BEGIN PRIVATE KEY/);
});

test('the key ID is worked out once per key',async()=>{
 const a=kidFromPrivateKey(pem,key), b=kidFromPrivateKey(pem,key);
 assert.equal(a,b,'same promise reused');
 assert.equal(await a,expectedKid('live'));
});

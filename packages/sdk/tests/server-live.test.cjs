const {test}=require('node:test');const assert=require('node:assert/strict');const {webcrypto}=require('node:crypto');
const {createIngestClient,signed,LiveBatchError}=require('../dist/server.js');
const config={siteId:'site',apiToken:'token'};
function fetchStub(t,fn){const old=global.fetch;global.fetch=fn;t.after(()=>global.fetch=old)}
function response(count,skipped=[]){return new Response(JSON.stringify({success:true,count,skipped}),{status:202})}
test('live signs internally, groups sequentially, and preserves skips',async t=>{
 const keys=await webcrypto.subtle.generateKey({name:'RSA-PSS',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const privateKey='-----BEGIN PRIVATE KEY-----\n'+Buffer.from(await webcrypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64')+'\n-----END PRIVATE KEY-----';
 const sent=[];let active=0,peak=0;
 fetchStub(t,async(url,options)=>{assert.ok(url.endsWith('/live'));assert.equal(options.headers['X-Akropolys-Site'],'site');const body=JSON.parse(options.body);sent.push(body);active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;
  assert.equal(await webcrypto.subtle.verify({name:'RSA-PSS',saltLength:32},keys.publicKey,Buffer.from(body.sig,'base64url'),Buffer.from(JSON.stringify(body.envelope))),true);
  return sent.length===2?response(0,[{key:'c',reason:'key_quota_reached'}]):response(body.envelope.records.length);
 });
 const records=['a','b','c'].map(key=>({key,fields:{price:3,active:true}}));
 const result=await createIngestClient({...config,privateKey,kid:'kid'}).ingestLive(records,signed,{batchSize:2});
 assert.equal(peak,1);assert.equal(result.count,2);assert.equal(result.skipped[0].reason,'key_quota_reached');
 assert.deepEqual(sent.flatMap(b=>b.envelope.records),records);assert.notEqual(sent[0].envelope.nonce,sent[1].envelope.nonce);
 assert.equal(require('../dist/server.js').signLiveRecords,undefined);
});
test('live default size is 100 and byte size can split a smaller group',async t=>{
 const sent=[];fetchStub(t,async(url,options)=>{const records=JSON.parse(options.body).records;sent.push(records.length);return response(records.length)});
 await createIngestClient(config).ingestLive(Array.from({length:205},(_,i)=>({key:String(i),fields:{v:1}})));
 assert.deepEqual(sent,[100,100,5]);sent.length=0;
 await createIngestClient(config).ingestLive([{key:'a',fields:{v:'x'.repeat(1100000)}},{key:'b',fields:{v:'x'.repeat(1100000)}}]);
 assert.deepEqual(sent,[1,1]);
});
test('live errors retain accepted progress and never retry unsigned',async t=>{
 let calls=0;fetchStub(t,async()=>{calls++;return calls===1?response(1):new Response(JSON.stringify({error:'Denied'}),{status:403})});
 await assert.rejects(createIngestClient(config).ingestLive(['a','b','c'].map(key=>({key,fields:{v:1}})),undefined,{batchSize:1}),e=>e instanceof LiveBatchError&&e.status===403&&e.nextIndex===1&&e.partialResult.count===1);
 assert.equal(calls,2);
 await assert.rejects(createIngestClient(config).ingestLive({key:'a',fields:{v:1}},signed),/privateKey and kid/);assert.equal(calls,2);
});
test('live invalid acknowledgements and oversized records are exposed',async t=>{
 let calls=0;fetchStub(t,async()=>{calls++;return response(0)});
 await assert.rejects(createIngestClient(config).ingestLive({key:'a',fields:{v:1}}),/Invalid live/);
 await assert.rejects(createIngestClient(config).ingestLive({key:'large',fields:{v:'x'.repeat(2000000)}}),e=>e.status===413&&e.nextIndex===0);
 assert.equal(calls,1);assert.equal((await createIngestClient(config).ingestLive([])).count,0);
});

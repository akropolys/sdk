const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {createIngestClient,IngestError,signed}=require('../dist/server.js');
const config={siteId:'demo',apiToken:'test-token'};

function fakeFetch(t,handler){const original=global.fetch;global.fetch=handler;t.after(()=>{global.fetch=original});}
function ok(data={success:true}){return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});}

test('server client routes one entity and batches without framework APIs',async t=>{
 const requests=[];fakeFetch(t,async(url,options)=>{requests.push({url,body:JSON.parse(options.body),options});return ok()});
 const client=createIngestClient({...config,apiUrl:'https://example.com/v1///'});
 const entity={id:'/one',title:'One',fields:{comments:[{text:'hello'}]},content:'Article'};
 await client.ingest(entity);await client.ingestBatch([entity]);
 assert.equal(requests[0].url,'https://example.com/v1/ingest');
 assert.deepEqual(requests[0].body,{siteId:'demo',entity});
 assert.equal(requests[1].url,'https://example.com/v1/ingest/batch');
 assert.deepEqual(requests[1].body,{siteId:'demo',entities:[entity]});
 assert.equal(requests[0].options.headers['X-Akropolys-Token'],'test-token');
 assert.equal(requests[0].options.cache,'no-store');
});

test('optional second parameter signs the whole batch and single record',async t=>{
 const keys=await webcrypto.subtle.generateKey({name:'RSA-PSS',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const pem='-----BEGIN PRIVATE KEY-----\n'+Buffer.from(await webcrypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64')+'\n-----END PRIVATE KEY-----';
 const sent=[];fakeFetch(t,async(url,options)=>{sent.push(JSON.parse(options.body));return ok()});
 const client=createIngestClient({...config,privateKey:pem,kid:'test-key'});
 const records=[{id:'/one',fields:{nested:{value:false}}},{id:'/two',content:'full article'}];
 await client.ingestBatch(records,signed);await client.ingest(records[0],{signed:true});
 assert.deepEqual(sent[0].envelope.entity,{entities:records});
 assert.deepEqual(sent[1].envelope.entity,records[0]);
 for(const body of sent){
  assert.equal(body.envelope.kid,'test-key');assert.equal(body.entities,undefined);assert.equal(body.entity,undefined);
  assert.equal(await webcrypto.subtle.verify({name:'RSA-PSS',saltLength:32},keys.publicKey,Buffer.from(body.sig,'base64url'),Buffer.from(JSON.stringify(body.envelope))),true);
  assert.ok(!JSON.stringify(body).includes('PRIVATE KEY'));
 }
 assert.notEqual(sent[0].envelope.nonce,sent[1].envelope.nonce);
 await client.ingest(records[0]);
 assert.deepEqual(sent[2],{siteId:'demo',entity:records[0]});
 let calls=0;global.fetch=async()=>{calls++;return new Response(JSON.stringify({error:'Signature rejected'}),{status:401})};
 await assert.rejects(client.ingestBatch(records,signed),e=>e instanceof IngestError&&e.status===401);
 assert.equal(calls,1);
});

test('queue acceptance is returned with its message and counts',async t=>{
 const queued={success:true,indexed:0,updated:0,queued:2,code:'reindex_queued',message:'Updates queued'};
 fakeFetch(t,async()=>new Response(JSON.stringify(queued),{status:202}));
 assert.deepEqual(await createIngestClient(config).ingestBatch([{id:'/one'},{id:'/two'}]),queued);
});

test('backend rejection preserves status and message without retry',async t=>{
 let calls=0;fakeFetch(t,async()=>{calls++;return new Response(JSON.stringify({error:'Batch requires Pro or Business'}),{status:402})});
 await assert.rejects(createIngestClient(config).ingestBatch([{id:'/one'}]),e=>e instanceof IngestError&&e.status===402&&e.message==='Batch requires Pro or Business');
 assert.equal(calls,1);
});

test('missing keys and signing failures never send unsigned requests',async t=>{
 let calls=0;fakeFetch(t,async()=>{calls++;return ok()});
 for(const keys of [{},{privateKey:'invalid'},{privateKey:'',kid:'key'}]) {
  const client=createIngestClient({...config,...keys});
  await assert.rejects(client.ingestBatch([{id:'/one'}],signed),/privateKey and kid/);
  await assert.rejects(client.ingest({id:'/one'},signed),/privateKey and kid/);
 }
 await assert.rejects(createIngestClient({...config,privateKey:'invalid',kid:'key'}).ingestBatch([{id:'/one'}],signed));
 for(const option of [null,true,{signed:'true'}]) {
  await assert.rejects(createIngestClient(config).ingest({id:'/one'},option),/second argument/);
 }
 assert.equal(calls,0);
});

test('ES module JavaScript exposes the same signed option',async()=>{
 const esm=await import('../dist/server.mjs');
 assert.deepEqual(esm.signed,{signed:true});
 assert.equal(esm.signIngest,undefined);
});

test('empty batch does no work and invalid acknowledgements are rejected',async t=>{
 let calls=0;fakeFetch(t,async()=>{calls++;return new Response('not JSON',{status:200})});
 assert.equal((await createIngestClient(config).ingestBatch([])).count,0);assert.equal(calls,0);
 await assert.rejects(createIngestClient(config).ingest({id:'/one'}),/Invalid ingestion response/);
});

test('ingestion owns signing; no separate signing function is exported',()=>{
 assert.equal(require('../dist/server.js').signIngest,undefined);
});

test('default groups of ten run sequentially and aggregate acceptance',async t=>{
 const requests=[];let active=0,maxActive=0;
 fakeFetch(t,async(url,options)=>{
  const group=JSON.parse(options.body).entities;
  requests.push({url,group});active++;maxActive=Math.max(maxActive,active);
  await new Promise(resolve=>setImmediate(resolve));active--;
  const queued=requests.length===2 ? group.length : 0;
  return new Response(JSON.stringify({success:true,indexed:queued?0:group.length,queued}),{status:queued?202:200});
 });
 const records=Array.from({length:23},(_,i)=>({id:String(i)}));
 const result=await createIngestClient(config).ingestBatch(records);
 assert.deepEqual(requests.map(r=>r.group.length),[10,10,3]);
 assert.deepEqual(requests.flatMap(r=>r.group),records);
 assert.ok(requests.every(r=>r.url.endsWith('/ingest/batch')));
 assert.equal(maxActive,1);
 assert.equal(result.count,23);assert.equal(result.indexed,13);assert.equal(result.queued,10);
 assert.equal(result.code,'reindex_queued');
});

test('third argument groups signed requests with independently valid signatures',async t=>{
 const keys=await webcrypto.subtle.generateKey({name:'RSA-PSS',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const privateKey='-----BEGIN PRIVATE KEY-----\n'+Buffer.from(await webcrypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64')+'\n-----END PRIVATE KEY-----';
 const bodies=[];
 fakeFetch(t,async(url,options)=>{assert.ok(url.endsWith('/ingest/batch'));bodies.push(JSON.parse(options.body));return ok({success:true,updated:JSON.parse(options.body).envelope.entity.entities.length});});
 const records=Array.from({length:5},(_,i)=>({id:String(i),fields:{comments:[`comment ${i}`]}}));
 const result=await createIngestClient({...config,privateKey,kid:'test-key'}).ingestBatch(records,signed,{batchSize:2});
 assert.deepEqual(bodies.map(b=>b.envelope.entity.entities.length),[2,2,1]);
 assert.deepEqual(bodies.flatMap(b=>b.envelope.entity.entities),records);
 assert.equal(new Set(bodies.map(b=>b.envelope.nonce)).size,3);
 for(const body of bodies) {
  assert.equal(await webcrypto.subtle.verify({name:'RSA-PSS',saltLength:32},keys.publicKey,Buffer.from(body.sig,'base64url'),Buffer.from(JSON.stringify(body.envelope))),true);
 }
 assert.equal(result.updated,5);
});

test('partial failure stops later groups and exposes the retry position',async t=>{
 const {IngestBatchError}=require('../dist/server.js');
 const records=Array.from({length:5},(_,i)=>({id:String(i)}));
 const requests=[];
 fakeFetch(t,async(url,options)=>{
  requests.push(JSON.parse(options.body).entities);
  return requests.length===1 ? new Response(JSON.stringify({success:true,queued:2,code:'reindex_queued'}),{status:202}) : new Response(JSON.stringify({error:'Service unavailable'}),{status:503});
 });
 let failure;
 await assert.rejects(createIngestClient(config).ingestBatch(records,undefined,{batchSize:2}),e=>{
  failure=e;return e instanceof IngestBatchError && e.status===503 && e.message==='Service unavailable';
 });
 assert.equal(requests.length,2);assert.equal(failure.nextIndex,2);
 assert.equal(failure.partialResult.count,2);assert.equal(failure.partialResult.queued,2);
 assert.equal(failure.partialResult.code,'reindex_queued');
 // The failed group's acknowledgement can be lost: resume includes that group.
 requests.length=0;
 global.fetch=async(url,options)=>{requests.push(JSON.parse(options.body).entities);return ok()};
 await createIngestClient(config).ingestBatch(records.slice(failure.nextIndex),undefined,{batchSize:2});
 assert.deepEqual(requests.flat(),records.slice(2));
});

test('network failure and first-group rejection never continue the import',async t=>{
 const {IngestBatchError}=require('../dist/server.js');
 let calls=0;const cause=new Error('connection lost');
 fakeFetch(t,async()=>{calls++;throw cause});
 await assert.rejects(createIngestClient(config).ingestBatch([{id:'/1'},{id:'/2'}],undefined,{batchSize:1}),e=>e instanceof IngestBatchError&&e.nextIndex===0&&e.partialResult.count===0&&e.cause===cause);
 assert.equal(calls,1);
 global.fetch=async()=>{calls++;return new Response(JSON.stringify({error:'Batch requires Pro'}),{status:402})};
 await assert.rejects(createIngestClient(config).ingestBatch([{id:'/1'},{id:'/2'}],undefined,{batchSize:1}),e=>e instanceof IngestBatchError&&e.status===402&&e.nextIndex===0);
 assert.equal(calls,2);
});

test('invalid group sizes fail before requests, and empty input sends nothing',async t=>{
 let calls=0;fakeFetch(t,async()=>{calls++;return ok()});
 for(const batchSize of [0,-1,1.5,Infinity,NaN,'10',Number.MAX_SAFE_INTEGER+1]) {
  await assert.rejects(createIngestClient(config).ingestBatch([{id:'/a'}],undefined,{batchSize}),/batchSize/);
 }
 for(const options of [null,10,[]]) {
  await assert.rejects(createIngestClient(config).ingestBatch([{id:'/a'}],undefined,options),/third argument/);
 }
 assert.equal((await createIngestClient(config).ingestBatch([],undefined,{batchSize:10})).count,0);
 assert.equal(calls,0);
});

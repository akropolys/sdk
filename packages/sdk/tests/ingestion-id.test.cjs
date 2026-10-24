const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createIngestClient}=require('../dist/server.js');
const {AkropolysClient,AkropolysAPI}=require('../dist/index.js');
const config={siteId:'site',apiToken:'test',apiUrl:'https://example.test'};

test('server requires explicit IDs and validates the entire import before sending',async t=>{
 const original=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return new Response(JSON.stringify({success:true}))};
 t.after(()=>{global.fetch=original});
 const api=createIngestClient(config);
 for(const id of [undefined,null,'',' a ',false,1.5,Number.MAX_SAFE_INTEGER+1,'a\u0000b']) {
  await assert.rejects(api.ingest({id,url:'/cannot-substitute',title:'A'}),/requires an id/);
 }
 await assert.rejects(api.ingestBatch([{id:'good'},{id:'also-good'},{url:'/missing'}],undefined,{batchSize:1}),/requires an id/);
 assert.equal(calls,0);
});

test('server accepts numeric zero and optional metadata without mutating source records',async t=>{
 const original=global.fetch;const bodies=[];
 global.fetch=async(_,options)=>{bodies.push(JSON.parse(options.body));return new Response(JSON.stringify({success:true}))};
 t.after(()=>{global.fetch=original});
 const api=createIngestClient(config);
 await api.ingest({id:0,name:'Zero'});
 assert.deepEqual(bodies[0].entity,{id:0,name:'Zero'});
 const record={id:'one',url:'/legacy-alias',fields:{url:'/recommended',price:2}};
 const before=structuredClone(record);
 await api.ingest(record);
 assert.deepEqual(record,before);
 assert.deepEqual(bodies[1].entity,{id:'one',fields:{url:'/recommended',price:2}});
 await api.ingest({id:'two',url:'/alias'});
 assert.deepEqual(bodies[2].entity,{id:'two',fields:{url:'/alias'}});
});

test('browser API retains ID and optional fields.url; signed envelopes remain exact',async()=>{
 const api=new AkropolysAPI('https://example.test','site','test');const sent=[];
 api.post=async(path,body)=>{sent.push({path,body});return {success:true}};
 await api.ingest({id:0,name:'Zero',fields:{price:1}});
 assert.deepEqual(sent[0].body.entity,{id:0,fields:{name:'Zero',price:1}});
 await api.ingest({id:'one',fields:{url:'/one'}});
 assert.equal(sent[1].body.entity.fields.url,'/one');
 assert.equal('url' in sent[1].body.entity,false);
 const signed={envelope:{entity:{id:'one',fields:{url:'/one'}},nonce:'new'},sig:'signature'};
 await api.ingest(signed);
 assert.deepEqual(sent[2].body.envelope,signed.envelope);
 await assert.rejects(api.ingestBatch([{id:'valid'},{url:'/missing'}]),/requires an id/);
 await assert.rejects(api.ingestBatch([signed,{envelope:{entity:{}},sig:'invalid'}]),/requires an id/);
 assert.equal(sent.length,3);
});

function client() {
 const c=Object.create(AkropolysClient.prototype);
 Object.assign(c,{ingestQueue:[],ingestedUrls:new Map(),scheduleFlush:()=>{}});
 return c;
}
test('browser deduplicates by ID and content while ignoring signature nonce',async()=>{
 const c=client();
 await c.ingest({envelope:{entity:{id:'one',title:'One'},nonce:'a'},sig:'a'});
 await c.ingest({envelope:{entity:{id:'one',title:'One'},nonce:'b'},sig:'b'});
 assert.equal(c.ingestQueue.length,1);
 await c.ingest({id:'two',title:'One'});
 assert.equal(c.ingestQueue.length,2,'same name is not identity');
 await c.ingest({id:'one',title:'One',fields:{url:'/changed'}});
 assert.equal(c.ingestQueue.length,3,'link update must be retained for the same ID');
 const before=c.ingestQueue.length;
 await assert.rejects(c.ingestMany([{id:'valid'},{title:'missing'}]),/requires an id/);
 assert.equal(c.ingestQueue.length,before,'invalid list must not queue a partial import');
 await assert.rejects(c.ingest({url:'/cannot-fallback'}),/requires an id/);
});

test('ID-only page context remains available without inventing a record URL',async t=>{
 const previousWindow=global.window,previousDocument=global.document;
 global.window={location:{href:'https://shop.test/detail',origin:'https://shop.test',pathname:'/detail'}};
 global.document={title:'Page'};
 t.after(()=>{global.window=previousWindow;global.document=previousDocument});
 const c=client();
 await c.ingest({id:0,title:'Zero',fields:{price:5}});
 const ctx=c.getCurrentContext();
 assert.equal(ctx.raw.id,0);assert.equal(ctx.raw.price,5);assert.equal(ctx.title,'Zero');
 assert.equal(ctx.raw.url,undefined);assert.equal(ctx.raw.fields.url,undefined);
 global.window.location={href:'https://shop.test/elsewhere',origin:'https://shop.test',pathname:'/elsewhere'};
 assert.deepEqual(c.getCurrentContext().raw,{},'navigation must not retain an unrelated ID-only record');
 await c.ingestMany([{id:'a'},{id:'b'}]);
 assert.deepEqual(c.getCurrentContext().raw,{},'list ingestion must not pretend its last item is the current page');
});

test('signed records omit optional undefined fields and preserve JSON array and date values',async t=>{
 const crypto=require('node:crypto');
 const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const privateKey=keys.privateKey.export({format:'pem',type:'pkcs8'}).toString();
 const original=global.fetch;let body;
 global.fetch=async(_,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({success:true}))};
 t.after(()=>{global.fetch=original});
 const record={id:'optional-fields',image:undefined,expiresAt:new Date('2027-01-01T00:00:00Z'),fields:{optionalField:undefined,nested:{missing:undefined,present:true},values:[undefined,'value']}};
 await createIngestClient({...config,privateKey,kid:'test'}).ingest(record,{signed:true});
 assert.equal('image' in body.envelope.entity,false);
 assert.equal('optionalField' in body.envelope.entity.fields,false);
 assert.deepEqual(body.envelope.entity.fields.nested,{present:true});
 assert.deepEqual(body.envelope.entity.fields.values,[null,'value']);
 assert.equal(body.envelope.entity.expiresAt,'2027-01-01T00:00:00.000Z');
 assert.equal(crypto.verify('sha256',Buffer.from(JSON.stringify(body.envelope)),{key:keys.publicKey,padding:crypto.constants.RSA_PKCS1_PSS_PADDING,saltLength:32},Buffer.from(body.sig,'base64url')),true);
});

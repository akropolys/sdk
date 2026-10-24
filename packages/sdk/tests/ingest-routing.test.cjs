const {test}=require('node:test');
const assert=require('node:assert/strict');
// Node exposes navigator without the browser onLine property.
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
const {AkropolysClient,AkropolysAPI}=require('../dist/index.js');

test('ordinary page queue uses the single-item endpoint',async()=>{
 const sent=[];
 const client=Object.create(AkropolysClient.prototype);
 Object.assign(client,{ingestedUrls:new Map(),saveIngestedCache:()=>{},isFlushing:false,ingestTimer:null,authLoading:false,ingestQueue:[{id:'/a'},{id:'/b'}],retryCount:0,
 api:{ingest:async item=>{sent.push(item);return {success:true}},ingestBatch:async()=>{throw new Error('ordinary page used paid batch endpoint')}}});
 await client.flushQueue();
 assert.deepEqual(sent,[{id:'/a'},{id:'/b'}]);
 assert.equal(client.ingestQueue.length,0);
 assert.equal(client.isFlushing,false);
});

test('explicit unsigned batch still reaches the gated batch endpoint',async()=>{
 const api=new AkropolysAPI('https://example.com','site','test');
 let route;
 api.post=async path=>{route=path;return {success:true}};
 await api.ingestBatch([{id:'/a'},{id:'/b'}]);
 assert.equal(route,'/ingest/batch');
 await api.ingest({id:'/a'});
 assert.equal(route,'/ingest');
});

test('ordinary captured-page queue submits one page at a time',async()=>{
 const sent=[];
 const client=Object.create(AkropolysClient.prototype);
 const pages=[{id:'/a',text:'first'},{id:'/b',text:'second'}];
 Object.assign(client,{isContentFlushing:false,contentIngestTimer:null,authLoading:false,contentQueue:[...pages],contentRetryCount:0,
 api:{ingestContentBatch:async items=>{sent.push(items);return {success:true}}}});
 await client.flushContentQueue();
 assert.deepEqual(sent,[[pages[0]],[pages[1]]]);
 assert.equal(client.contentQueue.length,0);
 assert.equal(client.isContentFlushing,false);
});

test('queued acceptance is durable; rejected versions stay retryable',async()=>{
 const client=Object.create(AkropolysClient.prototype);
 const item={id:'/a',title:'A'};
 Object.assign(client,{ingestedUrls:new Map(),saveIngestedCache:()=>{},scheduleFlush:()=>{},isFlushing:false,ingestTimer:null,authLoading:false,ingestQueue:[],retryCount:0,
 api:{ingest:async()=>{throw {status:402,message:'Plan required'}}}});
 await client.ingest(item);
 assert.equal(client.ingestedUrls.size,0,'enqueue is not backend acceptance');
 await client.flushQueue();
 assert.equal(client.ingestedUrls.size,0,'rejection must not persist a fingerprint');
 await client.ingest(item);
 assert.equal(client.ingestQueue.length,1,'same rejected item can be retried');
 client.api.ingest=async()=>({success:true,queued:1,code:'reindex_queued'});
 await client.flushQueue();
 assert.equal(client.ingestedUrls.size,1);
 await client.ingest(item);
 assert.equal(client.ingestQueue.length,0,'durably accepted versions need no browser retry');
});
test('individually signed submissions preserve queued responses',async()=>{
 const api=new AkropolysAPI('https://example.com','site','test');
 api.ingest=async()=>({success:true,queued:1,code:'reindex_queued'});
 const result=await api.ingestBatch([{envelope:{entity:{id:'/a'}},sig:'x'},{envelope:{entity:{id:'/b'}},sig:'y'}]);
 assert.equal(result.queued,2);assert.equal(result.code,'reindex_queued');
});

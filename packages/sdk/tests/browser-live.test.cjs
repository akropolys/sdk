const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
function harness(fetch){let tick,now=0;let client={api:{apiUrl:'https://example.com',siteId:'site',apiToken:'token'}};const exports={};
 const source=fs.readFileSync(path.join(__dirname,'../src/liveIngest.ts'),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports,require:()=>({getAkropolysClient:()=>client}),window:{},fetch,TextEncoder,AbortController,Error,TypeError,console,
  Date:{now:()=>now},setInterval:fn=>{tick=fn;return 1},clearInterval:()=>{},setTimeout:()=>2,clearTimeout:()=>{},
 });
 return {api:exports,flush:()=>tick(),advance:ms=>now+=ms,setSite:site=>client={api:{...client.api,siteId:site}}};
}
const ok=(count,skipped=[])=>new Response(JSON.stringify({success:true,count,skipped}),{status:202});
test('live browser coalesces keys, groups requests, and reports quota skips',async()=>{
 const sent=[],outcomes=[];const h=harness(async(url,opts)=>{const b=JSON.parse(opts.body);sent.push(b);return ok(b.records.length-1,[{key:b.records[0].key,reason:'key_quota_reached'}])});
 const observer={onResult:r=>outcomes.push(r)};
 for(let i=0;i<105;i++)h.api.pipeLiveData({key:String(i),fields:{v:1}},observer);
 h.api.pipeLiveData({key:'0',fields:{v:2}},observer);
 await h.flush();await h.flush();
 assert.deepEqual(sent.map(s=>s.records.length),[100,5]);assert.equal(sent[0].records[0].fields.v,2);
 assert.equal(outcomes.filter(r=>r.status==='skipped').length,2);assert.equal(outcomes.filter(r=>r.status==='accepted').length,103);
 h.api.stopLiveData();
});
test('retry uses backoff and keeps newer values instead of replaying old ticks',async()=>{
 let calls=0;const sent=[],outcomes=[];const h=harness(async(url,opts)=>{calls++;sent.push(JSON.parse(opts.body));if(calls===1)return new Response(JSON.stringify({error:'Temporarily unavailable'}),{status:503});return ok(1)});
 h.api.pipeLiveData({key:'a',fields:{v:1}},{onResult:r=>outcomes.push(r)});await h.flush();
 assert.equal(outcomes[0].retrying,true);assert.match(outcomes[0].error.message,/Temporarily/);
 h.api.pipeLiveData({key:'a',fields:{v:2}});await h.flush();assert.equal(calls,1);
 h.advance(1000);await h.flush();assert.equal(calls,2);assert.equal(sent[1].records[0].fields.v,2);h.api.stopLiveData();
});
test('permanent errors surface and do not cause retry storms',async()=>{
 let calls=0;const outcomes=[];const h=harness(async()=>{calls++;return new Response(JSON.stringify({error:'Signature required'}),{status:403})});
 h.api.pipeLiveData({key:'a',fields:{v:1}},{onResult:r=>outcomes.push(r)});await h.flush();h.advance(60000);await h.flush();
 assert.equal(calls,1);assert.equal(outcomes[0].retrying,false);assert.equal(outcomes[0].error.message,'Signature required');h.api.stopLiveData();
});
test('queued records keep their site even if the active client changes',async()=>{
 const sites=[];const h=harness(async(url,opts)=>{sites.push(opts.headers['X-Akropolys-Site']);return ok(1)});
 h.api.pipeLiveData({key:'a',fields:{v:1}});h.setSite('other');h.api.pipeLiveData({key:'a',fields:{v:2}});await h.flush();await h.flush();assert.deepEqual(sites,['site','other']);h.api.stopLiveData();
});
test('stopping an in-flight upload prevents requeue after rejection',async()=>{
 let reject,calls=0;const h=harness(()=>{calls++;return new Promise((_,r)=>reject=r)});
 h.api.pipeLiveData({key:'a',fields:{v:1}});const done=h.flush();h.api.stopLiveData();reject(new TypeError('network'));await done;h.advance(60000);await h.flush();assert.equal(calls,1);
});

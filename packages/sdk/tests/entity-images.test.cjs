const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AkropolysAPI,normalizeEntityImages}=require('../dist/index.js');

test('gallery URLs, order and captions survive normalization',()=>{
  const result=normalizeEntityImages([{url:'/front.jpg',caption:'Front'},'/inside.jpg','javascript:bad'],'https://example.com/front.jpg','https://example.com/listing/a');
  assert.deepEqual(result,[{url:'https://example.com/front.jpg',caption:'Front'},{url:'https://example.com/inside.jpg'}]);
  assert.equal(normalizeEntityImages([{url:'https://example.com/a.jpg'}],undefined,'/relative').length,1);
});
test('unsigned batches keep galleries on their own entities',async()=>{
  const api=new AkropolysAPI('https://example.com','site','test');let body;
  api.post=async(_,payload)=>{body=payload;return {success:true}};
  await api.ingestBatch([{id:'a',url:'https://example.com/a',images:[{url:'https://example.com/a.jpg',caption:'A'}],fields:{bedrooms:2}},{id:'b',url:'https://example.com/b',images:['https://example.com/b.jpg']}]);
  assert.equal(body.entities.length,2);
  assert.deepEqual(body.entities[0].images,[{url:'https://example.com/a.jpg',caption:'A'}]);
  assert.deepEqual(body.entities[1].images,['https://example.com/b.jpg']);
  assert.equal(body.entities[0].fields.bedrooms,2);
  assert.equal('images' in body.entities[0].fields,false);
});
test('signed batches send every envelope unchanged',async()=>{
  const api=new AkropolysAPI('https://example.com','site','test');const sent=[];
  api.post=async(_,payload)=>{sent.push(payload);return {success:true}};
  const entries=[{envelope:{entity:{id:'signed-image',images:[{url:'https://example.com/a.jpg'}]}},sig:'one'},{envelope:{entity:{id:'signed-image',images:[{url:'https://example.com/b.jpg'}]}},sig:'two'}];
  const result=await api.ingestBatch(entries);
  assert.equal(result.count,2);assert.equal(sent.length,2);
  sent.forEach((payload,i)=>{assert.deepEqual(payload.envelope,entries[i].envelope);assert.equal(payload.sig,entries[i].sig)});
});

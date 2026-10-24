const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const moduleObject={exports:{}};
const source=fs.readFileSync(path.join(__dirname,'../src/components/ChatModal/hooks/useChatCommands.ts'),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  module:moduleObject,exports:moduleObject.exports,require:name=>{
    assert.equal(name,'react');return {useCallback:callback=>callback};
  },
});
test('capture requires stable IDs and does not clear the composer for invalid targets',()=>{
  const calls=[],inputs=[],attachments=[];
  const commands=moduleObject.exports.useChatCommands({attachments:[],setAttachments:v=>attachments.push(v),setInput:v=>inputs.push(v),send:(...args)=>calls.push(args),t:(key,vars)=>JSON.stringify({key,...vars})});
  commands.handleKikuCapture({name:'No ID',url:'/item'});
  commands.handleKikuCaptureAll([{name:'No ID'},{id:'  ',name:'Blank ID'}]);
  assert.equal(calls.length,0);assert.equal(inputs.length,0);assert.equal(attachments.length,0);
  commands.handleKikuCaptureAll([{name:'No ID'},{id:'stable-1',name:'Kept',fields:{url:'/kept'}}]);
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'Kept');assert.equal(JSON.parse(calls[0][1].slice(6)).count,'1');
  assert.equal(calls[0][4].length,1);assert.equal(calls[0][4][0].id,'stable-1');assert.equal(calls[0][4][0].url,'/kept');
  commands.handleKikuCapture({id:'stable-2',name:'Single'});
  assert.equal(calls[1][4][0].id,'stable-2');
});

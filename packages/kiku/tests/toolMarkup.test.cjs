const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const moduleObject={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/utils/toolMarkup.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleObject,exports:moduleObject.exports});
const {stripToolMarkup}=moduleObject.exports;
const markup='<｜DSML｜calls>\n<｜DSML｜invoke name="read_live"><｜DSML｜parameter name="query" string="true">Liverpool</｜DSML｜parameter></｜DSML｜invoke>\n</｜DSML｜calls>';
test('provider calls and their arguments never render from current or saved messages',()=>{
  assert.equal(stripToolMarkup(markup),'');
  assert.equal(stripToolMarkup('Before. '+markup+' After.'),'Before.  After.');
  assert.equal(stripToolMarkup(markup.replaceAll('｜','|')),'');
  assert.equal(stripToolMarkup('A normal answer with a balance of 100.'),'A normal answer with a balance of 100.');
});
test('every streaming split of the DSML marker stays hidden',()=>{
  for(let i=1;i<=markup.length;i++) assert.equal(stripToolMarkup(markup.slice(0,i)),'',`prefix ${i}`);
  assert.equal(stripToolMarkup('< | DSML | calls>< | DSML | invoke name="read_live">'), '');
});

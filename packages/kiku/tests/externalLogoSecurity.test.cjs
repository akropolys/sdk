const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/components/ChatModal/components/ExternalLinks.tsx'), 'utf8');
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020, jsx:ts.JsxEmit.React}}).outputText;
const moduleObject = {exports:{}};
vm.runInNewContext(js, {module:moduleObject,exports:moduleObject.exports,URL,require:name => name === 'react' ? {} : {} });
const {safeLogoSource} = moduleObject.exports;

test('assistant links do not load tracking images from arbitrary origins', () => {
  const link={favicon:'https://private-data.attacker.example/favicon.ico',logo:'https://attacker.example/logo?data=private'};
  assert.equal(safeLogoSource(link,'https://shop.example'),undefined);
  assert.equal(safeLogoSource({favicon:'https://youtube.com.attacker.example/favicon.ico'},'https://shop.example'),undefined);
  assert.equal(safeLogoSource({favicon:'http://youtube.com/favicon.ico'},'https://shop.example'),undefined);
  assert.equal(safeLogoSource({favicon:'https://user:pass@youtube.com/favicon.ico'},'https://shop.example'),undefined);
});

test('site-hosted merchant logos and fixed known-service icons remain available', () => {
  assert.equal(safeLogoSource({logo:'/logo.png'},'https://shop.example'),'https://shop.example/logo.png');
  assert.equal(safeLogoSource({favicon:'https://www.youtube.com/favicon.ico'},'https://shop.example'),'https://www.youtube.com/favicon.ico');
  assert.equal(safeLogoSource({favicon:'https://www.youtube.com/favicon.ico?data=private'},'https://shop.example'),undefined);
});

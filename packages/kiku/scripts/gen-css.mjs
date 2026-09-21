// Concatenates src/styles/ into src/styles.css and fails if a rule would be dropped from the shadow root.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MODULES = [
  'base.css',
  'chat.css',
  'search.css',
  'scripts.css',
  'voice.css',
  'themes.css',
  'animations.css',
];

const css = MODULES.map(m => readFileSync(join('src/styles', m), 'utf8')).join('\n');
writeFileSync('src/styles.css', css, 'utf8');
writeFileSync('src/styles/cssText.ts', `export const KIKU_CSS = ${JSON.stringify(css)};\n`, 'utf8');

function blocks(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf('{', i);
    if (open === -1) break;
    const semi = s.indexOf(';', i);
    if (semi !== -1 && semi < open) { out.push({ prelude: s.slice(i, semi).trim(), body: '' }); i = semi + 1; continue; }
    let depth = 0, j = open;
    for (; j < s.length; j++) { if (s[j] === '{') depth++; else if (s[j] === '}' && --depth === 0) break; }
    out.push({ prelude: s.slice(i, open).trim(), body: s.slice(open + 1, j) });
    i = j + 1;
  }
  return out;
}

const OWN = /hsk|kiku/i;
const lost = [];
(function walk(s) {
  for (const { prelude, body } of blocks(s)) {
    if (/^@(media|supports|container|layer)\b/.test(prelude) && body) walk(body);
    else if (!OWN.test(prelude + body)) lost.push(prelude.slice(0, 80));
  }
})(css.replace(/\/\*[\s\S]*?\*\//g, ''));

if (lost.length) {
  console.error(`gen-css: ${lost.length} rule(s) name neither hsk nor kiku, so the chat window would not get them:\n  ${lost.join('\n  ')}`);
  process.exit(1);
}
console.log(`generated src/styles.css (${css.length} bytes)`);

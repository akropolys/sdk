// Full CSS goes into the shadow root (cssText.ts); styles.css keeps only what the launcher and search bar need on the host page.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { transform } from 'esbuild';

const MODULES = [
  'base.css',
  'chat.css',
  'search.css',
  'scripts.css',
  'voice.css',
  'themes.css',
  'animations.css',
];
const LIGHT_DOM = ['src/components/KikuButton.tsx', 'src/components/SearchBar.tsx'];

let css = MODULES.map(m => readFileSync(join('src/styles', m), 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const minify = async s => (await transform(s, { loader: 'css', minify: true })).code.trim();

function blocks(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf('{', i);
    if (open === -1) break;
    const semi = s.indexOf(';', i);
    if (semi !== -1 && semi < open) { out.push({ prelude: s.slice(i, semi).trim(), body: null }); i = semi + 1; continue; }
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
    else if (!OWN.test(prelude + (body ?? ''))) lost.push(prelude.slice(0, 80));
  }
})(css);
if (lost.length) {
  console.error(`gen-css: ${lost.length} rule(s) name neither hsk nor kiku, so the chat window would not get them:\n  ${lost.join('\n  ')}`);
  process.exit(1);
}

// Classes built from strings at runtime; anything starting with these is kept.
const DYNAMIC = ['hsk-kiku-', 'hsk-goo-', 'hsk-markup-canvas--', 'hsk-markdown-h', 'hsk-table-wrapper--', 'hsk-cb-allowance--', 'hsk-cb-layout-discovery-note--'];
const sourceFiles = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return p === join('src', 'styles') ? [] : sourceFiles(p);
  return /\.(tsx?|jsx?|mjs)$/.test(e.name) ? [p] : [];
});
const source = [...sourceFiles('src'), ...sourceFiles('../sdk/src')].map(f => readFileSync(f, 'utf8')).join('\n');
const named = new Set(), prefixes = [...DYNAMIC];
for (const [, name, built] of source.matchAll(/((?:hsk|kiku)-[\w-]*)(\$\{(?![^}]*\?\s*['"`]\s)|['"`]\s*\+)?/g)) {
  if (built || name.endsWith('-')) prefixes.push(name); else named.add(name);
}
const used = c => named.has(c) || prefixes.some(p => c.startsWith(p));

const splitTop = s => {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && !depth) { out.push(s.slice(start, i)); start = i + 1; }
  }
  return [...out, s.slice(start)];
};
const outside = sel => {
  let out = '', depth = 0;
  for (const ch of sel) { if (ch === '(') depth++; else if (ch === ')') depth--; else if (!depth) out += ch; }
  return out;
};
const removed = new Set();
const live = sel => {
  const dead = [...outside(sel).matchAll(/\.((?:hsk|kiku)-[\w-]+)/g)].map(m => m[1]).filter(c => !used(c));
  dead.forEach(c => removed.add(c));
  return !dead.length;
};
function prune(s) {
  let out = '';
  for (const { prelude, body } of blocks(s)) {
    if (body === null) out += `${prelude};`;
    else if (/^@(media|supports|container|layer)\b/.test(prelude)) { const inner = prune(body); if (inner.trim()) out += `${prelude}{${inner}}`; }
    else if (prelude.startsWith('@')) out += `${prelude}{${body}}`;
    else { const kept = splitTop(prelude).filter(live); if (kept.length) out += `${kept.join(',')}{${body}}`; }
  }
  return out;
}
css = prune(css);
const stillNamed = new Set([...css.matchAll(/\.((?:hsk|kiku)-[\w-]+)/g)].map(m => m[1]));
const gone = [...removed].filter(c => !stillNamed.has(c)).sort();
if (process.env.CSS_REPORT) console.log(`dropped ${gone.length} unused classes:\n  ${gone.join('\n  ')}\nprefixes: ${[...new Set(prefixes)].join(' ')}`);

const light = new Set(LIGHT_DOM.flatMap(p => [...readFileSync(p, 'utf8').matchAll(/hsk-[\w-]+/g)].map(m => m[0])));
const keepRule = prelude => {
  const classes = [...prelude.matchAll(/\.((?:hsk|kiku)-[\w-]+)/g)].map(m => m[1]);
  return classes.length === 0 || classes.some(c => light.has(c));
};
const keyframes = new Map();
function hostCss(s) {
  let out = '';
  for (const { prelude, body } of blocks(s)) {
    if (body === null) continue;
    if (/^@keyframes\s/.test(prelude)) keyframes.set(prelude.split(/\s+/)[1], `${prelude}{${body}}`);
    else if (/^@(media|supports|container|layer)\b/.test(prelude)) { const inner = hostCss(body); if (inner) out += `${prelude}{${inner}}`; }
    else if (prelude.startsWith('@') || keepRule(prelude)) out += `${prelude}{${body}}`;
  }
  return out;
}
let host = hostCss(css);
host += [...keyframes].filter(([name]) => new RegExp(`\\b${name}\\b`).test(host)).map(([, rule]) => rule).join('');

const full = await minify(css);
const hostMin = await minify(host);
writeFileSync('src/styles.css', hostMin + '\n', 'utf8');
writeFileSync('src/styles/cssText.ts', `export const KIKU_CSS = ${JSON.stringify(full)};\n`, 'utf8');
console.log(`generated shadow css (${full.length} bytes) and host styles.css (${hostMin.length} bytes)`);

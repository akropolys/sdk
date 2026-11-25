import { build } from 'esbuild';
import { writeFile, readFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const packageVersion = JSON.parse(await readFile('package.json', 'utf8')).version;

await build({
  entryPoints: ['src/embed.tsx'], outdir: 'dist/embed', entryNames: 'embed',
  bundle: true, splitting: false, format: 'esm', minify: true, target: 'es2020',
  define: { 'process.env.NODE_ENV': '"production"', __KIKU_VERSION__: JSON.stringify(packageVersion), __KIKU_VOICE_WORKLET__: JSON.stringify(await readFile('src/assets/voice-worklet.js', 'utf8')) },
  alias: { '@akropolys/sdk': resolve('../sdk/src/index.ts') },
  metafile: true,
}).then(async result => {
  await writeFile('dist/embed/meta.json', JSON.stringify(result.metafile));
});
await copyFile('src/assets/voice-worklet.js', 'dist/voice-worklet.js');

// The loader (src/loader.js) runs on every page view of every site, so it
// has a hard size budget; the widget itself loads only when a shopper uses it.
const LOADER_BUDGET_GZIP = 3 * 1024;
await build({
  entryPoints: ['src/loader.js'], outfile: 'dist/kiku.js',
  bundle: false, minify: true, target: 'es2020',
});
const loaderGzip = gzipSync(await readFile('dist/kiku.js')).length;
if (loaderGzip > LOADER_BUDGET_GZIP) {
  throw new Error(`dist/kiku.js is ${loaderGzip} bytes gzipped; the budget is ${LOADER_BUDGET_GZIP}.`);
}
console.log(`kiku.js loader: ${loaderGzip} bytes gzipped (budget ${LOADER_BUDGET_GZIP})`);

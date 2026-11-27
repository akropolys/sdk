import { build } from 'esbuild';
import { writeFile, readFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const packageVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
const worklet = (await readFile('src/assets/voice-worklet.js', 'utf8')).replace(/\r\n/g, '\n');

const PREACT = {
  react: 'preact/compat',
  'react-dom': 'preact/compat',
  'react-dom/client': 'preact/compat/client',
  'react/jsx-runtime': 'preact/compat/jsx-runtime',
};

const common = alias => ({
  bundle: true, format: 'esm', minify: true, target: 'es2020', metafile: true,
  define: { 'process.env.NODE_ENV': '"production"', __KIKU_VERSION__: JSON.stringify(packageVersion), __KIKU_VOICE_WORKLET__: JSON.stringify(worklet) },
  alias: { '@akropolys/sdk': resolve('../sdk/src/index.ts'), ...alias },
});

// The photo markup editor is its own file, loaded on first use. It borrows
// React from embed.js so both share one instance.
const lazyMarkup = {
  name: 'lazy-markup',
  setup(b) {
    b.onResolve({ filter: /\/MarkupEditor$/ }, a => a.kind === 'dynamic-import' ? { path: './markup.js', external: true } : undefined);
  },
};
const fromEmbed = alias => ({
  name: 'from-embed',
  setup(b) {
    b.onResolve({ filter: /^\.\/embed\.js$/ }, () => ({ path: './embed.js', external: true }));
    b.onResolve({ filter: /^react(\/jsx-runtime)?$/ }, a => ({ path: a.path, namespace: 'shared' }));
    b.onLoad({ filter: /.*/, namespace: 'shared' }, a => {
      const names = Object.keys(require(alias[a.path] ?? a.path)).filter(k => /^[A-Za-z_$][\w$]*$/.test(k) && k !== 'default');
      const ns = a.path === 'react' ? '__react' : '__jsx';
      return {
        contents: `import { ${ns} as R } from './embed.js';\nexport default R.default ?? R;\nexport const { ${names.join(', ')} } = R;`,
        loader: 'js', resolveDir: '.',
      };
    });
  },
});

async function embed(out, alias = {}) {
  const main = await build({
    ...common(alias),
    stdin: {
      contents: (alias.react ? "import { preactEffects } from './scripts/preact-effects.mjs';\npreactEffects();\n" : '') + "export * from './src/embed.tsx';\nexport * as __react from 'react';\nexport * as __jsx from 'react/jsx-runtime';",
      resolveDir: '.', sourcefile: 'embed-entry.tsx', loader: 'tsx',
    },
    outfile: `${out}/embed/embed.js`,
    plugins: [lazyMarkup],
  });
  const markup = await build({
    ...common(alias),
    entryPoints: ['src/components/MarkupEditor.tsx'],
    outfile: `${out}/embed/markup.js`,
    plugins: [fromEmbed(alias)],
  });
  const inputs = r => Object.keys(Object.values(r.metafile.outputs)[0].inputs);
  const inMain = new Set(inputs(main));
  const twice = inputs(markup).filter(f => inMain.has(f));
  if (twice.length) throw new Error(`markup.js would duplicate modules already in embed.js: ${twice.join(', ')}`);
  await mkdir('node_modules/.cache', { recursive: true });
  await writeFile(`node_modules/.cache/kiku-embed-meta${alias.react ? '-preact' : ''}.json`, JSON.stringify(main.metafile));
  await writeFile(`${out}/voice-worklet.js`, worklet);
}

// The loader (src/loader.js) runs on every page view of every site, so it
// has a hard size budget; the widget itself loads only when a shopper uses it.
const LOADER_BUDGET_GZIP = 3 * 1024;
async function loader(out) {
  await build({ entryPoints: ['src/loader.js'], outfile: `${out}/kiku.js`, bundle: false, minify: true, target: 'es2020' });
  const loaderGzip = gzipSync(await readFile(`${out}/kiku.js`)).length;
  if (loaderGzip > LOADER_BUDGET_GZIP) {
    throw new Error(`${out}/kiku.js is ${loaderGzip} bytes gzipped; the budget is ${LOADER_BUDGET_GZIP}.`);
  }
  console.log(`kiku.js loader: ${loaderGzip} bytes gzipped (budget ${LOADER_BUDGET_GZIP})`);
}

await embed('dist');
await loader('dist');

// A Preact build to try on the CDN only; npm keeps React.
if (process.argv.includes('--preact')) {
  await embed('dist-preact', PREACT);
  await loader('dist-preact');
  await copyFile('dist/styles.css', 'dist-preact/styles.css');
}

import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

await build({
  entryPoints: ['src/embed.tsx'], outdir: 'dist/embed', entryNames: 'embed',
  bundle: true, splitting: false, format: 'esm', minify: true, target: 'es2020',
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: { '@akropolys/sdk': resolve('../sdk/src/index.ts') },
  metafile: true,
}).then(async result => {
  await writeFile('dist/embed/meta.json', JSON.stringify(result.metafile));
});
await writeFile('dist/kiku.js', `(() => {
  if (window.Kiku) return;
  const script = document.currentScript;
  const url = new URL('./embed/embed.js', script.src).href;
  const styles = document.createElement('link');
  styles.rel = 'stylesheet';
  styles.href = new URL('./styles.css', script.src).href;
  const styled = new Promise((resolve, reject) => {
    styles.onload = resolve;
    styles.onerror = () => reject(new Error('Kiku styles could not load.'));
  });
  document.head.append(styles);
  let instance;
  let pending;
  const api = window.Kiku = {
    mount(options) {
      if (pending) return pending;
      pending = Promise.all([
        import(url),
        styled,
        document.body ? Promise.resolve() : new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
      ]).then(([module]) => { instance = module.mount(options); return instance; })
        .catch(error => { pending = undefined; throw error; });
      return pending;
    },
    open() { return ready().then(widget => widget.open()); },
    ingest(data) { return ready().then(widget => widget.ingest(data)); },
    updateIdentity(identity) { return ready().then(widget => widget.updateIdentity(identity)); },
    async destroy() {
      if (!pending) return;
      try { (await pending).destroy(); } finally { instance = undefined; pending = undefined; }
    }
  };
  function ready() {
    return pending || Promise.reject(new Error('Call Kiku.mount() first.'));
  }
  if (script.dataset.siteId) {
    api.ready = api.mount({ siteId: script.dataset.siteId, apiToken: script.dataset.apiToken,
      apiUrl: script.dataset.apiUrl, voiceUrl: script.dataset.voiceUrl,
      button: { label: script.dataset.label || 'Ask Kiku', enableVoice: script.dataset.voice === 'true' }
    });
    api.ready.catch(error => {
      window.dispatchEvent(new CustomEvent('kiku:error', { detail: error }));
      console.error('[Kiku]', error);
    });
  }
})();`);

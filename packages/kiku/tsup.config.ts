import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    styles: 'src/styles.css',
  },
  clean: true,
  define: {
    __KIKU_VERSION__: JSON.stringify(packageVersion),
    // Built-in copy of the voice processor, used when the CDN copy cannot load.
    __KIKU_VOICE_WORKLET__: JSON.stringify(readFileSync('src/assets/voice-worklet.js', 'utf8')),
  },
  format: ['cjs', 'esm'],
  dts: true,
  minify: true,
  banner: {
    js: "'use client';",
  },
  external: ['react', 'react-dom', '@akropolys/sdk'],
  sourcemap: false,
});

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    styles: 'src/styles.css',
  },
  format: ['cjs', 'esm'],
  dts: true,
  banner: {
    js: "'use client';",
  },
  external: ['react', 'react-dom', '@akropolys/sdk'],
  sourcemap: true,
});

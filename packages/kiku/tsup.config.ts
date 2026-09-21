import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    styles: 'src/styles.css',
  },
  clean: true,
  format: ['cjs', 'esm'],
  dts: true,
  minify: true,
  banner: {
    js: "'use client';",
  },
  external: ['react', 'react-dom', '@akropolys/sdk'],
  sourcemap: true,
});

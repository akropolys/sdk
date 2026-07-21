import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    clean: true,
    banner: {
      js: "'use client';",
    },
    external: ['react', 'react-dom'],
    sourcemap: true,
  },
  {
    entry: {
      server: 'src/server.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    clean: false,
    external: ['react', 'react-dom'],
    sourcemap: true,
  },
]);

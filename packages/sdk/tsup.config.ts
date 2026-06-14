import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    commerce: 'src/commerce.ts',
    property: 'src/property.ts',
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
});

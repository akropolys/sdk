import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    commerce: 'src/commerce.ts',
    property: 'src/property.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  // Prepend the 'use client' directive to every output JS file so React client APIs work in Next.js
  banner: {
    js: "'use client';",
  },
  // Keep React as an external dependency to avoid bundling it and preserve proper client runtime
  external: ['react', 'react-dom'],
  // Enable source maps for easier debugging (optional)
  sourcemap: true,
});

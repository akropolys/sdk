import { defineConfig } from 'tsup';

export default defineConfig([
  // 1. Standard library build (ESM + CJS) for React / Next.js projects
  {
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
  },
  // 2. Standalone IIFE bundle for Shopify & non-React websites (bundles React, ReactDOM & SDK)
  {
    entry: {
      shopify: 'src/shopify.tsx',
      'kiku.iife': 'src/shopify.tsx',
    },
    format: ['iife'],
    globalName: 'KikuBundle',
    minify: true,
    dts: false,
    noExternal: [/.*/],
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    sourcemap: true,
  },
]);

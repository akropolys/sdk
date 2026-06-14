import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/test.ts', 'src/test-e2e.ts'],
  format: ['cjs'],
  clean: true,
  dts: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});

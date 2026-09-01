import { copyFileSync, existsSync } from 'node:fs';

const copies = [
  ['dist/shopify.global.js', 'dist/shopify.js'],
  ['dist/kiku.iife.global.js', 'dist/kiku.iife.js'],
  ['dist/shopify.global.js.map', 'dist/shopify.js.map'],
  ['dist/kiku.iife.global.js.map', 'dist/kiku.iife.js.map'],
];

for (const [src, dest] of copies) {
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`[postbuild] Created ${dest}`);
  }
}

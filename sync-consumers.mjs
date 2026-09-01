#!/usr/bin/env node
/**
 * Copies the built sdk dist into every consuming project.
 *
 * pnpm resolves the `kiku` file: dependency to a hard link, so a rebuild there
 * is visible everywhere at once — but it makes a real copy of `sdk`. Rebuilding
 * both therefore hands a project the new kiku against its stale sdk, and the
 * app dies on an export that exists in source but not in the copy it loads.
 *
 * Run after every sdk build. Kept here rather than in one app because the
 * breakage lands in whichever consumer was not synced.
 */
import { cpSync, existsSync, realpathSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = [
  { name: '@akropolys/sdk', src: 'C:/Users/user/Desktop/sdk/packages/sdk/dist', root: 'C:/Users/user/Desktop/sdk/packages/sdk' },
  { name: '@akropolys/kiku', src: 'C:/Users/user/Desktop/sdk/packages/kiku/dist', root: 'C:/Users/user/Desktop/sdk/packages/kiku' },
];

const CONSUMERS = [
  'C:/Users/user/kankan/prediction-markets',
  'C:/Users/user/kankan/prediction-markets/ingest',
  'C:/Users/user/kankan/husk-dashboard',
  'C:/Users/user/Desktop/kankan-property',
  'C:/Users/user/Desktop/kiku-live-demo',
];

for (const pkg of PACKAGES) {
  const pkgJsonPath = join(pkg.root, 'package.json');
  if (existsSync(pkgJsonPath)) {
    try {
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      if (pkgJson.dependencies && Object.keys(pkgJson.dependencies).length > 0) {
        console.error(`refusing to sync ${pkg.name}: contains runtime dependencies (${Object.keys(pkgJson.dependencies).join(', ')}). All dependencies must be bundled or peerDependencies.`);
        process.exit(1);
      }
    } catch (e) {
      console.error(`warning: could not parse ${pkgJsonPath}: ${e.message}`);
    }
  }

  if (!existsSync(pkg.src)) {
    console.error(`no build at ${pkg.src} — run the build first`);
    continue;
  }

  for (const root of CONSUMERS) {
    const pkgDir = join(root, 'node_modules', pkg.name);
    if (!existsSync(pkgDir)) {
      continue;
    }
    const targetDir = realpathSync(pkgDir);
    const dest = join(targetDir, 'dist');
    try {
      cpSync(pkg.src, dest, { recursive: true, force: true });
      console.log(`sync  ${pkg.name} -> ${root}`);
    } catch (err) {
      if (err.code === 'ERR_FS_CP_EINVAL' || /same file/i.test(err.message)) {
        console.log(`ok    ${pkg.name} -> ${root} (already linked)`);
      } else {
        console.error(`fail  ${pkg.name} -> ${root}: ${err.message}`);
      }
    }
  }
}

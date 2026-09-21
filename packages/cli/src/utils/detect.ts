import fs from 'fs';
import path from 'path';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface Framework {
  id: 'next-app' | 'next-pages' | 'vite' | 'astro' | 'unknown';
  label: string;
  envPrefix: string;
  envFile: string;
  entry?: string;
  typescript: boolean;
}

export function detectPackageManager(cwd = process.cwd()): PackageManager {
  const ua = process.env.npm_config_user_agent || '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('bun')) return 'bun';

  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return 'bun';
  return 'npm';
}

export function installArgs(pm: PackageManager, packages: string[]): string[] {
  if (pm === 'npm') return ['install', ...packages];
  if (pm === 'yarn') return ['add', ...packages];
  return ['add', ...packages];
}

function firstExisting(cwd: string, candidates: string[]): string | undefined {
  for (const c of candidates) {
    if (fs.existsSync(path.join(cwd, c))) return c;
  }
  return undefined;
}

export function detectFramework(cwd = process.cwd()): Framework {
  const typescript = fs.existsSync(path.join(cwd, 'tsconfig.json'));

  let deps: Record<string, string> = {};
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      deps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch {
      deps = {};
    }
  }

  if (deps.next) {
    const appEntry = firstExisting(cwd, [
      'app/layout.tsx', 'app/layout.jsx', 'src/app/layout.tsx', 'src/app/layout.jsx',
    ]);
    if (appEntry) {
      return { id: 'next-app', label: 'Next.js (App Router)', envPrefix: 'NEXT_PUBLIC_', envFile: '.env.local', entry: appEntry, typescript };
    }
    const pagesEntry = firstExisting(cwd, [
      'pages/_app.tsx', 'pages/_app.jsx', 'src/pages/_app.tsx', 'src/pages/_app.jsx',
    ]);
    return { id: 'next-pages', label: 'Next.js (Pages Router)', envPrefix: 'NEXT_PUBLIC_', envFile: '.env.local', entry: pagesEntry, typescript };
  }

  if (deps.astro) {
    return { id: 'astro', label: 'Astro', envPrefix: 'PUBLIC_', envFile: '.env', entry: firstExisting(cwd, ['src/layouts/Layout.astro']), typescript };
  }

  if (deps.vite || fs.existsSync(path.join(cwd, 'vite.config.ts')) || fs.existsSync(path.join(cwd, 'vite.config.js'))) {
    return { id: 'vite', label: 'Vite', envPrefix: 'VITE_', envFile: '.env', entry: firstExisting(cwd, ['src/main.tsx', 'src/main.jsx', 'src/App.tsx']), typescript };
  }

  return { id: 'unknown', label: 'Other / plain', envPrefix: 'NEXT_PUBLIC_', envFile: '.env', typescript };
}

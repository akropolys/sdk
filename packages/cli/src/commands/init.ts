import { spawn } from 'child_process';
import {
  intro, outro, text, password, select, confirm, note, log, isCancel, cancel,
} from '@clack/prompts';
import pc from 'picocolors';
import { detectFramework, detectPackageManager, installArgs, type Framework, type PackageManager } from '../utils/detect';
import { writeEnv, ensureGitignored } from '../utils/env';
import { snippetFor } from '../utils/snippet';
import { openBrowser } from '../utils/open';
import { gridSpinner } from '../utils/spinner';
import { startHandshake } from '../utils/login';
import { api, ApiError, type Site } from '../utils/api';
import { banner, box, bold, dim, gradient } from '../utils/theme';

const SHELL_LOGIN_URL = 'https://shell.akropolys.cloud/cli-login';
const SETUP_URL = 'https://shell.akropolys.cloud/sdk-setup';
const DEFAULT_API_URL = 'https://agora-740936679905.europe-west1.run.app/v1';
const PACKAGES = ['@akropolys/sdk', '@akropolys/kiku'];

interface InitOptions {
  skipInstall?: boolean;
  apiUrl?: string;
  login?: boolean;
  shellUrl?: string;
}

interface Credentials {
  siteId: string;
  apiKey: string;
  kid?: string;
  privateKey?: string;
}

function bail<T>(value: T | symbol): asserts value is T {
  if (isCancel(value)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32' });
    let stderr = '';
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split('\n').slice(-3).join('\n') || `${cmd} exited with code ${code}`));
    });
  });
}

// /health is public, so it proves nothing about the key. /agent/manifest is the
// cheapest endpoint behind the site-key middleware.
async function verify(apiUrl: string, siteId: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${apiUrl}/agent/manifest`, {
      headers: { 'X-Akropolys-Token': apiKey, 'X-Akropolys-Site': siteId },
    });
    if (res.ok) return null;
    if (res.status === 401 || res.status === 403) return 'the API rejected that key';
    return `the API responded with ${res.status}`;
  } catch (err: any) {
    return `could not reach ${apiUrl} (${err.message})`;
  }
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

// Sites usually start life on localhost, so a bare host is taken as http://.
function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function hostOf(url: string): string | null {
  try {
    return new URL(normalizeUrl(url)).hostname;
  } catch {
    return null;
  }
}

async function chooseFramework(): Promise<Framework> {
  const detected = detectFramework();
  const chosen = await select({
    message: 'Which project is this?',
    initialValue: detected.id,
    options: [
      { value: 'next-app', label: 'Next.js (App Router)' },
      { value: 'next-pages', label: 'Next.js (Pages Router)' },
      { value: 'vite', label: 'Vite' },
      { value: 'astro', label: 'Astro' },
      { value: 'unknown', label: 'Other / plain' },
    ],
  });
  bail(chosen);

  if (chosen === detected.id) return detected;
  return {
    ...detected,
    id: chosen as Framework['id'],
    entry: undefined,
    envPrefix: chosen === 'vite' ? 'VITE_' : chosen === 'astro' ? 'PUBLIC_' : 'NEXT_PUBLIC_',
    envFile: chosen === 'next-app' || chosen === 'next-pages' ? '.env.local' : '.env',
  };
}

async function installPackages(pm: PackageManager) {
  const doInstall = await confirm({ message: `Install ${PACKAGES.join(' and ')} with ${pm}?` });
  bail(doInstall);
  if (!doInstall) return;

  const s = gridSpinner();
  s.start(`Installing with ${pm}`);
  try {
    await run(pm, installArgs(pm, PACKAGES));
    s.stop(pc.green('Packages installed'));
  } catch (err: any) {
    s.stop(pc.yellow('Install failed'), pc.yellow('▲'));
    log.error(err.message);
    log.info(`Install them yourself with: ${gradient(`${pm} ${installArgs(pm, PACKAGES).join(' ')}`)}`);
  }
}

// The token lives in this process only — the backend issues no refresh token, and
// a 15-minute credential on disk is a footgun rather than a session.
async function signIn(shellUrl: string): Promise<string> {
  const handshake = await startHandshake(shellUrl);

  note(`Confirm this code in the browser\n\n   ${bold(gradient(handshake.code.split('').join(' ')))}\n\n${dim(handshake.url)}`, 'Sign in');
  if (!openBrowser(handshake.url)) {
    log.info('Could not open a browser — paste the link above yourself.');
  }

  const s = gridSpinner();
  s.start('Waiting for the browser');
  try {
    const token = await handshake.token;
    s.stop(pc.green('Signed in'));
    return token;
  } catch (err: any) {
    s.stop(pc.yellow(err.message), pc.yellow('▲'));
    handshake.close();
    throw err;
  }
}

async function pickSite(client: ReturnType<typeof api>): Promise<string> {
  const s = gridSpinner();
  s.start('Loading your sites');
  let sites: Site[] = [];
  try {
    sites = await client.listSites();
    s.stop(pc.green(sites.length ? `${sites.length} site${sites.length === 1 ? '' : 's'} found` : 'No sites yet'));
  } catch (err: any) {
    s.stop(pc.yellow('Could not load your sites'), pc.yellow('▲'));
    throw err;
  }

  const CREATE = '__create__';
  let chosen: string = CREATE;

  if (sites.length) {
    const answer = await select({
      message: 'Which site is this project for?',
      options: [
        ...sites.map((site) => ({ value: site.id, label: site.name || site.id, hint: site.url })),
        { value: CREATE, label: gradient('Create a new site') },
      ],
    });
    bail(answer);
    chosen = answer as string;
  }

  if (chosen !== CREATE) return chosen;

  const name = await text({
    message: 'Site name',
    placeholder: 'Acme Store',
    validate: (v) => (v.trim() ? undefined : 'Required'),
  });
  bail(name);

  const url = await text({
    message: 'Site URL',
    placeholder: 'http://localhost:3000',
    validate: (v) => (hostOf(v) ? undefined : 'Enter a URL, e.g. http://localhost:3000'),
  });
  bail(url);

  const id = await text({
    message: 'Site ID',
    initialValue: slugify(name),
    validate: (v) => (/^[a-z0-9][a-z0-9-]*$/.test(v.trim()) ? undefined : 'Lowercase letters, digits and dashes only'),
  });
  bail(id);

  const create = gridSpinner();
  create.start('Creating the site');
  try {
    const site = await client.createSite({
      id: id.trim(),
      name: name.trim(),
      url: normalizeUrl(url),
      allowed_domains: [hostOf(url)!],
    });
    create.stop(pc.green(`Site ${pc.bold(site.id || id.trim())} created`));
    return site.id || id.trim();
  } catch (err: any) {
    create.stop(pc.yellow('Could not create the site'), pc.yellow('▲'));
    throw err;
  }
}

async function mintKey(client: ReturnType<typeof api>, siteId: string): Promise<Credentials> {
  const s = gridSpinner();
  s.start('Minting an API key');
  try {
    const key = await client.createKey(`CLI — ${siteId}`, siteId);
    s.stop(pc.green(`Key ${pc.bold(key.key_prefix)} minted`));
    return { siteId, apiKey: key.key, kid: key.kid, privateKey: key.private_key };
  } catch (err: any) {
    s.stop(pc.yellow('Could not mint a key'), pc.yellow('▲'));
    throw err;
  }
}

async function pasteCredentials(apiUrl: string): Promise<Credentials> {
  note(`Your Site ID and API key live at\n${pc.cyan(SETUP_URL)}`, 'Credentials');

  const shouldOpen = await confirm({ message: 'Open that page in your browser?' });
  bail(shouldOpen);
  if (shouldOpen) openBrowser(SETUP_URL);

  const siteId = await text({
    message: 'Site ID',
    validate: (v) => (v.trim() ? undefined : 'Required'),
  });
  bail(siteId);

  const apiKey = await password({
    message: 'API key',
    validate: (v) => (v.trim() ? undefined : 'Required'),
  });
  bail(apiKey);

  const s = gridSpinner();
  s.start('Verifying credentials');
  const problem = await verify(apiUrl, siteId.trim(), apiKey.trim());
  if (problem) {
    s.stop(pc.yellow(`Could not verify — ${problem}`), pc.yellow('▲'));
    const keep = await confirm({ message: 'Write them anyway?' });
    bail(keep);
    if (!keep) {
      cancel('Nothing written.');
      process.exit(1);
    }
  } else {
    s.stop(pc.green('Credentials verified'));
  }

  return { siteId: siteId.trim(), apiKey: apiKey.trim() };
}

export async function runInit(options: InitOptions = {}) {
  const apiUrl = options.apiUrl?.trim() || DEFAULT_API_URL;

  console.log(`
${banner()}
`);
  intro(dim('project setup'));

  const framework = await chooseFramework();
  const pm = detectPackageManager();

  if (!options.skipInstall) await installPackages(pm);

  let credentials: Credentials;

  if (options.login === false) {
    credentials = await pasteCredentials(apiUrl);
  } else {
    try {
      const token = await signIn(options.shellUrl?.trim() || SHELL_LOGIN_URL);
      const client = api(apiUrl, token);
      const siteId = await pickSite(client);
      credentials = await mintKey(client, siteId);
    } catch (err: any) {
      log.warn(err instanceof ApiError ? `${err.message} (HTTP ${err.status})` : err.message);
      const fallback = await confirm({ message: 'Paste a Site ID and API key instead?' });
      bail(fallback);
      if (!fallback) {
        cancel('Nothing written.');
        process.exit(1);
      }
      credentials = await pasteCredentials(apiUrl);
    }
  }

  const p = framework.envPrefix;
  const vars: Record<string, string> = {
    [`${p}AKROPOLYS_SITE_ID`]: credentials.siteId,
    [`${p}AKROPOLYS_API_KEY`]: credentials.apiKey,
    [`${p}AKROPOLYS_API_URL`]: apiUrl,
  };

  if (credentials.kid && credentials.privateKey) {
    const alsoSigning = await confirm({
      message: 'Also write the signing keypair? It is shown only once, and only your server can use it.',
    });
    bail(alsoSigning);
    if (alsoSigning) {
      vars.AKROPOLYS_KID = credentials.kid;
      vars.AKROPOLYS_PRIVATE_KEY = JSON.stringify(credentials.privateKey);
    }
  }

  const result = writeEnv(framework.envFile, vars);
  const touched = [...result.added, ...result.updated];
  log.success(`${pc.bold(framework.envFile)} — ${touched.length} variable${touched.length === 1 ? '' : 's'} written`);
  if (ensureGitignored(framework.envFile)) {
    log.info(`Added ${framework.envFile} to .gitignore`);
  }

  note(snippetFor(framework), framework.entry ? `Add to ${framework.entry}` : 'Mount the widget');

  console.log(box('ready', [
    ['site', bold(credentials.siteId)],
    ['key', bold(`${credentials.apiKey.slice(0, 12)}…`)],
    ['env', bold(framework.envFile)],
  ]));
  console.log('');

  outro(dim(`check it end to end with `) + gradient('npx @akropolys/cli doctor'));
}

import fs from 'fs';
import pc from 'picocolors';

export function loadEnv() {
  const envPaths = ['.env', '.env.local'];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          const value = trimmed.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (key) {
            process.env[key] = value;
          }
        }
      }
    }
  }
}

export async function runDoctor(options: { verbose?: boolean }) {
  console.log(pc.bold('\nAkropolys Doctor'));
  console.log(pc.dim('─────────────────────────'));

  loadEnv();

  const siteId = process.env.NEXT_PUBLIC_AKROPOLYS_SITE_ID || process.env.VITE_AKROPOLYS_SITE_ID || '';
  const apiToken = process.env.NEXT_PUBLIC_AKROPOLYS_API_TOKEN || process.env.VITE_AKROPOLYS_API_TOKEN || '';
  const apiUrl = process.env.NEXT_PUBLIC_AKROPOLYS_API_URL || process.env.VITE_AKROPOLYS_API_URL || 'https://api.akropolys.cloud/v1';

  if (options.verbose) {
    console.log(pc.dim(`[Verbose] Site ID: ${siteId || '<not set>'}`));
    console.log(pc.dim(`[Verbose] API Token: ${apiToken ? '********' : '<not set>'}`));
    console.log(pc.dim(`[Verbose] API URL: ${apiUrl}`));
  }

  // 1. Configuration check
  if (!siteId) {
    console.log(pc.red('❌ Configuration: Site ID is missing. Set NEXT_PUBLIC_AKROPOLYS_SITE_ID in your env.'));
    process.exit(1);
  }
  console.log(pc.green(`✓ Configuration: Site ID detected (${siteId})`));

  if (!apiToken) {
    console.log(pc.red('❌ Environment: API Token is missing. Set NEXT_PUBLIC_AKROPOLYS_API_TOKEN in your env.'));
    process.exit(1);
  }
  console.log(pc.green('✓ Environment: API Token detected'));

  // 2. Connectivity check
  const start = Date.now();
  try {
    const res = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      headers: {
        'X-Akropolys-Token': apiToken,
        'X-Akropolys-Site': siteId,
      },
    }).catch(err => {
      // Throw fetch failures
      throw new Error(`Fetch failed: ${err.message}`);
    });

    const duration = Date.now() - start;

    if (!res.ok) {
      console.log(pc.red(`❌ Connection: API responded with status ${res.status} (Ping: ${duration}ms)`));
      process.exit(2);
    }

    console.log(pc.green(`✓ Connection: Successfully connected to ${apiUrl} (ping: ${duration}ms)`));

    console.log(pc.bold(pc.green('\nStatus: Healthy (All configuration and connectivity checks passed)')));
    process.exit(0);
  } catch (err: any) {
    console.log(pc.red(`❌ Connection: Unreachable API at ${apiUrl}. Error: ${err.message}`));
    process.exit(2);
  }
}

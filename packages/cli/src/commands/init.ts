import readline from 'readline';
import fs from 'fs';
import pc from 'picocolors';

const question = (rl: readline.Interface, query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};

export async function runInit() {
  console.log(pc.bold(pc.cyan('\nConfiguring Akropolys Workspace...')));
  console.log(pc.dim('─────────────────────────'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const siteId = await question(rl, pc.cyan('? Enter your Akropolys Site ID: '));
    const apiToken = await question(rl, pc.cyan('? Enter your Akropolys API Token: '));

    // apiUrl is optional — the SDK defaults to the shared managed backend
    // (https://api.akropolys.cloud/v1). Only self-hosted/local dev needs to set it.
    const envContent = `NEXT_PUBLIC_AKROPOLYS_SITE_ID=${siteId.trim()}
NEXT_PUBLIC_AKROPOLYS_API_TOKEN=${apiToken.trim()}
`;

    fs.writeFileSync('.env', envContent, 'utf-8');
    console.log(pc.dim('\n─────────────────────────'));
    console.log(pc.green('✓ Generated .env with configuration parameters.'));
    console.log(pc.green('✓ Saved config template.'));
  } catch (err: any) {
    console.error(pc.red(`\n❌ Error generating configuration: ${err.message}`));
    process.exit(1);
  } finally {
    rl.close();
  }
}

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
    const apiUrlInput = await question(rl, pc.cyan('? Enter your Akropolys API URL (default: https://api.akropolys.io): '));
    const apiUrl = apiUrlInput.trim() || 'https://api.akropolys.io';

    console.log(pc.cyan('? Select your vertical:'));
    console.log('  1. commerce');
    console.log('  2. property');
    console.log('  3. motor');
    const verticalIndex = await question(rl, pc.cyan('  Select (1-3, default: 1): '));
    let vertical = 'commerce';
    if (verticalIndex === '2') vertical = 'property';
    else if (verticalIndex === '3') vertical = 'motor';

    const envContent = `NEXT_PUBLIC_AKROPOLYS_SITE_ID=${siteId.trim()}
NEXT_PUBLIC_AKROPOLYS_API_TOKEN=${apiToken.trim()}
NEXT_PUBLIC_AKROPOLYS_API_URL=${apiUrl.trim()}
NEXT_PUBLIC_AKROPOLYS_VERTICAL=${vertical}
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

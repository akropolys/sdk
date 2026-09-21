import { Command } from 'commander';
import { runInit } from './commands/init';
import { runDoctor } from './commands/doctor';
import { runInspect } from './commands/inspect';
import pkg from '../package.json';

const program = new Command();

program
  .name('akropolys')
  .description('Akropolys Command Line Tool — Developer diagnostics, setup helper, and structural inspector.')
  .version(pkg.version);

program
  .command('init')
  .description('Set up Akropolys in this project: install the packages, capture credentials, mount the widget.')
  .option('--skip-install', 'Do not install @akropolys/sdk and @akropolys/kiku.')
  .option('--api-url <url>', 'Override the API base URL.')
  .option('--no-login', 'Skip the browser sign-in and paste credentials instead.')
  .option('--shell-url <url>', 'Override the sign-in page URL.')
  .action(async (options) => {
    await runInit(options);
  });

program
  .command('doctor')
  .description('Perform a health check consolidating local configuration values and backend API reachability.')
  .option('-v, --verbose', 'Include verbose logs and configuration dumps.')
  .action(async (options) => {
    await runDoctor(options);
  });

program
  .command('inspect')
  .description('Statically inspect a catalog payload file or stream against the Akropolys Anti-Pattern Registry.')
  .argument('[file]', 'Path to the local catalog JSON file.')
  .option('--stdin', 'Force reading data from standard input.')
  .option('--strict', 'Fail the process (exit code 3) if any structural registry warnings are triggered.')
  .action(async (file, options) => {
    await runInspect(file, options);
  });

program.parse(process.argv);

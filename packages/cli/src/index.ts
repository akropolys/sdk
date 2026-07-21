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
  .description('Configure the local workspace by generating a default .env file template.')
  .action(async () => {
    await runInit();
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

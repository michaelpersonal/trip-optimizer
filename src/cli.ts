#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { configCommand } from './commands/config.js';
import { profileCommand } from './commands/profile.js';
import { scoreCommand } from './commands/score.js';

const program = new Command();

program
  .name('trip-optimizer')
  .description('Autonomously optimize travel plans using the autoresearch pattern')
  .version('0.1.0');

program
  .command('init <name>')
  .description('Create a new trip project')
  .action(initCommand);

program
  .command('config')
  .description('Manage API keys and provider settings')
  .argument('[args...]', 'config subcommand and arguments')
  .action((args: string[]) => configCommand(args));

program
  .command('profile')
  .description('View travel profile and preferences')
  .action(() => profileCommand());

program
  .command('score')
  .description('Run a one-off absolute score of the current plan')
  .action(scoreCommand);

program.parse();

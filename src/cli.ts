#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';

const program = new Command();

program
  .name('trip-optimizer')
  .description('Autonomously optimize travel plans using the autoresearch pattern')
  .version('0.1.0');

program
  .command('init <name>')
  .description('Create a new trip project')
  .action(initCommand);

program.parse();

#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('trip-optimizer')
  .description('Autonomously optimize travel plans using the autoresearch pattern')
  .version('0.1.0');

// Commands will be registered here as they are built

program.parse();

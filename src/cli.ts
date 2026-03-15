#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { configCommand } from './commands/config.js';
import { profileCommand } from './commands/profile.js';
import { scoreCommand } from './commands/score.js';
import { researchCommand } from './commands/research.js';
import { runCommand } from './commands/run.js';
import { statusCommand } from './commands/status.js';
import { debriefCommand } from './commands/debrief.js';
import { historyCommand } from './commands/history.js';
import { dashboardCommand } from './commands/dashboard.js';
import { chartCommand } from './commands/chart.js';
import { planCommand } from './commands/plan.js';

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

program
  .command('research [city]')
  .description('Research sprint for a specific city or all cities')
  .action(researchCommand);

program
  .command('run')
  .description('Start the optimization loop')
  .option('--agent', 'Launch as Claude Code agent (yolo mode)')
  .option('--safe', 'Use normal permissions in agent mode')
  .action(runCommand);

program
  .command('status')
  .description('Show current score and optimization progress')
  .action(statusCommand);

program
  .command('debrief')
  .description('Post-trip debrief — rate experiences and build memory')
  .action(debriefCommand);

program
  .command('history')
  .description('View past trip debriefs and learned preferences')
  .action(historyCommand);

program
  .command('dashboard')
  .description('Live dashboard showing optimization progress')
  .option('--watch', 'Auto-refresh every 5 seconds')
  .action((options) => dashboardCommand(options));

program
  .command('chart')
  .description('ASCII chart of score progression')
  .action(chartCommand);

program
  .command('plan')
  .description('Pretty-print the current travel plan')
  .action(planCommand);

program.parse();

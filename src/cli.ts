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
  .description('Start the optimization loop (default: agent mode)')
  .option('--standalone', 'Use direct API calls instead of Claude Code agent')
  .option('--headless', 'Run agent non-interactively (fire and forget)')
  .option('--safe', 'Use normal permissions in agent mode (no yolo)')
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
  .option('--pdf', 'Generate a PDF document')
  .option('-o, --output <path>', 'Output path for PDF')
  .action(planCommand);

// Global error handler — catch unhandled LLM / provider errors
process.on('unhandledRejection', (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n  \x1b[31mError: ${msg}\x1b[0m`);
  if (msg.includes('404') || msg.includes('NOT_FOUND')) {
    console.error(`  \x1b[33mModel not found. Check ANTHROPIC_MODEL=${process.env.ANTHROPIC_MODEL || '(not set)'}\x1b[0m`);
    console.error(`  \x1b[33mProject: ${process.env.GOOGLE_CLOUD_PROJECT || '(not set)'}, Region: ${process.env.GOOGLE_CLOUD_LOCATION || '(not set)'}\x1b[0m`);
  } else if (msg.includes('401') || msg.includes('403') || msg.includes('PERMISSION')) {
    console.error('  \x1b[33mAuthentication failed. Run: gcloud auth application-default login\x1b[0m');
  } else if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
    console.error('  \x1b[33mNetwork error. Check your internet connection.\x1b[0m');
  }
  console.error();
  process.exit(1);
});

program.parse();

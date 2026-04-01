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
import { tripListAction, tripShowAction, tripSetDefaultAction } from './commands/trip.js';
import { proposalsAction } from './commands/proposals.js';
import { rejectAction } from './commands/reject.js';
import { applyAction } from './commands/apply.js';
import { askAction } from './commands/ask.js';
import { loadConfig } from './data/config.js';
import { setLanguage } from './i18n.js';

// Load language from config at startup
const _cfg = loadConfig();
if (_cfg.language) setLanguage(_cfg.language);

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

const tripCmd = program.command('trip').description('Manage trips');

tripCmd.command('list')
  .description('List registered trips')
  .option('--json', 'JSON output')
  .action((options) => tripListAction(options));

tripCmd.command('show')
  .description('Show trip plan')
  .option('--trip <id>', 'Trip ID')
  .option('--day <n>', 'Show specific day', parseInt)
  .option('--lang <code>', 'Language (en|zh)')
  .option('--json', 'JSON output')
  .action((options) => tripShowAction(options));

tripCmd.command('set-default <id>')
  .description('Set default trip')
  .action((id) => tripSetDefaultAction(id));

program
  .command('proposals')
  .description('List proposals for a trip')
  .option('--trip <id>', 'Trip ID')
  .option('--status <status>', 'Filter by status (pending|applied|rejected)')
  .option('--json', 'JSON output')
  .action((options) => proposalsAction(options));

program
  .command('reject')
  .description('Reject a pending proposal')
  .option('--trip <id>', 'Trip ID')
  .requiredOption('--proposal <id>', 'Proposal ID')
  .option('--json', 'JSON output')
  .action((options) => rejectAction(options));

program
  .command('apply')
  .description('Apply a pending proposal')
  .option('--trip <id>', 'Trip ID')
  .requiredOption('--proposal <id>', 'Proposal ID')
  .option('--approved-by <name>', 'Who approved')
  .option('--json', 'JSON output')
  .action((options) => applyAction(options));

program
  .command('ask')
  .description('Ask a question about the trip plan')
  .option('--trip <id>', 'Trip ID')
  .requiredOption('--question <q>', 'Question to ask')
  .option('--lang <code>', 'Response language (en|zh)')
  .option('--json', 'JSON output')
  .action((options) => askAction(options));

// Global error handler — catch unhandled LLM / provider errors
process.on('unhandledRejection', (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n  \x1b[31mError: ${msg}\x1b[0m`);
  if (msg.includes('401') || msg.includes('403') || msg.includes('Authentication') || msg.includes('PERMISSION')) {
    if (_cfg.model_override) {
      console.error(`  \x1b[33mAPI key for ${_cfg.model_override.model} is invalid or expired.\x1b[0m`);
    } else if (process.env.CLAUDE_CODE_USE_VERTEX === '1' || process.env.GOOGLE_CLOUD_PROJECT) {
      console.error('  \x1b[33mAuthentication failed. Run: gcloud auth application-default login\x1b[0m');
    } else {
      console.error('  \x1b[33mAnthropic API key is invalid. Run: trip-optimizer config set api_key <key>\x1b[0m');
    }
  } else if (msg.includes('404') || msg.includes('NOT_FOUND')) {
    if (_cfg.model_override) {
      console.error(`  \x1b[33mModel "${_cfg.model_override.model}" not found at ${_cfg.model_override.base_url}\x1b[0m`);
    } else {
      console.error(`  \x1b[33mModel not found. Check ANTHROPIC_MODEL=${process.env.ANTHROPIC_MODEL || '(not set)'}\x1b[0m`);
    }
  } else if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
    console.error('  \x1b[33mNetwork error. Check your internet connection.\x1b[0m');
  }
  console.error();
  process.exit(1);
});

program.parse();

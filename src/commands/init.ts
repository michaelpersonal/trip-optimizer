import { input, select, checkbox, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadConfig, saveConfig } from '../data/config.js';
import { loadProfile, saveProfile, type Profile } from '../data/profile.js';
import { getGlobalDir, getLearnedPath } from '../data/paths.js';
import { scaffoldTrip } from '../data/trip.js';
import { createProvider } from '../llm/factory.js';
import { generateConstraints, type InitAnswers } from '../generators/constraints.js';
import { generateRubrics } from '../generators/rubrics.js';
import { generatePlan } from '../generators/plan.js';
import { generateProgram } from '../generators/program.js';
import type { TripConstraints } from '../data/schemas.js';

export async function initCommand(name: string): Promise<void> {
  console.log(chalk.bold(`\n  trip-optimizer: ${name}\n`));

  const config = loadConfig();
  const profile = loadProfile();

  // First-time setup: API key (skip if Vertex AI detected)
  const useVertex = !!(process.env.CLAUDE_CODE_USE_VERTEX === '1' || process.env.GOOGLE_CLOUD_PROJECT);
  if (!config.api_key && !useVertex) {
    console.log(chalk.yellow('  First time? Let\'s set up your profile.\n'));

    const apiKey = await input({
      message: 'Anthropic API key:',
      validate: (v) => v.length > 0 || 'API key is required',
    });

    config.api_key = apiKey;
    saveConfig(config);
    console.log(chalk.green('  API key saved.\n'));
  } else if (useVertex && !config.api_key) {
    console.log(chalk.cyan('  Using Vertex AI (detected from environment).\n'));
  }

  // First-time setup: profile
  if (profile.trips_completed === 0 && profile.loyalty_program === '' && profile.stated_vibes.length === 0) {
    const loyalty = await select({
      message: 'Hotel loyalty program:',
      choices: [
        { value: 'marriott_bonvoy', name: 'Marriott Bonvoy' },
        { value: 'hilton_honors', name: 'Hilton Honors' },
        { value: 'ihg_rewards', name: 'IHG Rewards' },
        { value: 'hyatt', name: 'World of Hyatt' },
        { value: '', name: 'None' },
      ],
    });

    const dietaryChoices = await checkbox({
      message: 'Dietary restrictions:',
      choices: [
        { value: 'vegetarian', name: 'Vegetarian' },
        { value: 'vegan', name: 'Vegan' },
        { value: 'halal', name: 'Halal' },
        { value: 'kosher', name: 'Kosher' },
        { value: 'gluten_free', name: 'Gluten-free' },
        { value: 'no_shellfish', name: 'No shellfish' },
        { value: 'no_nuts', name: 'No nuts' },
      ],
    });

    profile.loyalty_program = loyalty;
    profile.dietary = dietaryChoices;
    saveProfile(profile);
  } else if (profile.trips_completed > 0) {
    console.log(chalk.cyan(`  Welcome back! ${profile.trips_completed} past trips on record.\n`));

    // Show learned preferences for returning users
    if (profile.learned_vibes.length > 0) {
      console.log(chalk.dim(`  Learned vibes: ${profile.learned_vibes.join(', ')}`));
    }
    if (profile.anti_patterns_learned.length > 0) {
      console.log(chalk.dim(`  Learned anti-patterns: ${profile.anti_patterns_learned.join(', ')}`));
    }
    if (Object.keys(profile.source_trust).length > 0) {
      const sources = Object.entries(profile.source_trust)
        .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
        .join(', ');
      console.log(chalk.dim(`  Source trust: ${sources}`));
    }
    console.log();
  }

  // Trip-specific prompts
  const startDate = await input({ message: 'Start date (YYYY-MM-DD):' });
  const endDate = await input({ message: 'End date (YYYY-MM-DD):' });
  const travelers = await input({ message: 'Number of travelers:', default: '2' });
  const origin = await input({ message: 'Departing from (city):', default: 'Atlanta' });

  const citiesRaw = await input({
    message: 'Cities in order (comma-separated):',
    validate: (v) => v.includes(',') || v.length > 0 || 'Enter at least one city',
  });

  const cities = citiesRaw.split(',').map(c => {
    const trimmed = c.trim();
    const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return { name: trimmed, key };
  });

  const budgetTotal = await input({ message: 'Total budget (USD):', default: '5000' });

  const vibes = await checkbox({
    message: 'Pick your vibes (select 3):',
    choices: [
      { value: 'wandering', name: 'Wandering & exploring' },
      { value: 'food', name: 'Food & culinary' },
      { value: 'culture', name: 'Culture & arts' },
      { value: 'nature', name: 'Nature & outdoors' },
      { value: 'adventure', name: 'Adventure & thrills' },
      { value: 'relaxation', name: 'Relaxation & wellness' },
      { value: 'nightlife', name: 'Nightlife & entertainment' },
      { value: 'history', name: 'History & heritage' },
      { value: 'shopping', name: 'Shopping' },
      { value: 'family', name: 'Family-friendly' },
      { value: 'romantic', name: 'Romantic' },
    ],
  });

  const learnedAntiDefaults = profile.anti_patterns_learned.length > 0
    ? profile.anti_patterns_learned.join(', ')
    : '';

  const antiPatternsRaw = await input({
    message: 'Anything to avoid? (comma-separated, or press Enter to skip):',
    default: learnedAntiDefaults,
  });

  const antiPatterns = antiPatternsRaw
    ? antiPatternsRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const answers: InitAnswers = {
    name,
    start_date: startDate,
    end_date: endDate,
    travelers: parseInt(travelers, 10),
    origin,
    cities,
    budget_total: parseInt(budgetTotal, 10),
    budget_currency: 'USD',
    vibes,
    anti_patterns: antiPatterns,
    dietary: profile.dietary,
    loyalty_program: profile.loyalty_program,
  };

  // Generate constraints
  const constraintsYaml = generateConstraints(answers);
  const constraints = yaml.load(constraintsYaml) as TripConstraints;

  // Load learned signals if available
  let learnedSignals: string | undefined;
  const learnedPath = getLearnedPath();
  if (fs.existsSync(learnedPath)) {
    learnedSignals = fs.readFileSync(learnedPath, 'utf-8');
  }

  // Generate LLM-dependent files
  const provider = createProvider(config);

  const spinner = ora('Generating scoring rubrics...').start();
  const rubricsYaml = await generateRubrics(provider, constraints, learnedSignals);
  spinner.succeed('Scoring rubrics generated');

  spinner.start('Generating initial plan...');
  const planMd = await generatePlan(provider, constraints);
  spinner.succeed('Initial plan generated');

  // Generate program.md (no LLM needed)
  const programMd = generateProgram(constraints, config);

  // Scaffold the trip project
  const tripDirName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const tripDir = path.resolve(tripDirName);

  if (fs.existsSync(tripDir)) {
    const overwrite = await confirm({ message: `Directory ${tripDirName} already exists. Overwrite?`, default: false });
    if (!overwrite) {
      console.log('Aborted.');
      return;
    }
    fs.rmSync(tripDir, { recursive: true, force: true });
  }

  spinner.start('Creating trip project...');
  await scaffoldTrip(tripDir, {
    constraints: constraintsYaml,
    rubrics: rubricsYaml,
    plan: planMd,
    program: programMd,
  });
  spinner.succeed(`Trip project created at ${chalk.bold(tripDirName)}/`);

  console.log(`
  ${chalk.green('Next steps:')}
    cd ${tripDirName}
    ${chalk.dim('# Review constraints.yaml and rubrics.yaml')}
    trip-optimizer run
`);
}

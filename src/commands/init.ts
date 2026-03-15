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
import { AnthropicProvider } from '../llm/anthropic.js';
import { generateConstraints, type InitAnswers } from '../generators/constraints.js';
import { generateRubrics } from '../generators/rubrics.js';
import { generatePlan } from '../generators/plan.js';
import { generateProgram } from '../generators/program.js';
import type { TripConstraints } from '../data/schemas.js';

export async function initCommand(name: string): Promise<void> {
  console.log(chalk.bold(`\n  trip-optimizer: ${name}\n`));

  const config = loadConfig();
  const profile = loadProfile();

  // First-time setup: API key
  if (!config.api_key) {
    console.log(chalk.yellow('  First time? Let\'s set up your profile.\n'));

    const apiKey = await input({
      message: 'Anthropic API key:',
      validate: (v) => v.length > 0 || 'API key is required',
    });

    config.api_key = apiKey;
    saveConfig(config);
    console.log(chalk.green('  API key saved.\n'));
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

  const antiPatternsRaw = await input({
    message: 'Anything to avoid? (comma-separated, or press Enter to skip):',
    default: '',
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
  const provider = new AnthropicProvider(config.api_key);

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

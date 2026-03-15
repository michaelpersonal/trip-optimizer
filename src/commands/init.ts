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

function loadExisting(name: string): TripConstraints | null {
  const tripDirName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const constraintsPath = path.resolve(tripDirName, 'constraints.yaml');
  if (!fs.existsSync(constraintsPath)) return null;
  try {
    return yaml.load(fs.readFileSync(constraintsPath, 'utf-8')) as TripConstraints;
  } catch {
    return null;
  }
}

async function collectAnswers(name: string, profile: Profile): Promise<InitAnswers> {
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
    message: 'Pick your vibes (Space to select, Enter to confirm):',
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
    default: profile.anti_patterns_learned.length > 0 ? profile.anti_patterns_learned.join(', ') : '',
  });

  const antiPatterns = antiPatternsRaw
    ? antiPatternsRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  return {
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
}

async function editAnswers(name: string, existing: TripConstraints, profile: Profile): Promise<InitAnswers> {
  // Show current settings
  console.log(chalk.bold('  Current settings:\n'));
  console.log(`    ${chalk.dim('1.')} Start date:    ${chalk.white(existing.trip.start_date)}`);
  console.log(`    ${chalk.dim('2.')} End date:      ${chalk.white(existing.trip.end_date)}`);
  console.log(`    ${chalk.dim('3.')} Travelers:     ${chalk.white(String(existing.trip.travelers))}`);
  console.log(`    ${chalk.dim('4.')} Origin:        ${chalk.white(existing.trip.origin)}`);
  console.log(`    ${chalk.dim('5.')} Cities:        ${chalk.white(existing.cities.map(c => c.name).join(', '))}`);
  console.log(`    ${chalk.dim('6.')} Budget:        ${chalk.white(`${existing.budget?.currency || 'USD'} ${existing.budget?.total || 5000}`)}`);
  console.log(`    ${chalk.dim('7.')} Vibes:         ${chalk.white(existing.preferences.priority_order.join(', '))}`);
  console.log(`    ${chalk.dim('8.')} Anti-patterns: ${chalk.white(existing.preferences.anti_patterns.join(', ') || 'none')}`);
  console.log();

  const editChoice = await select({
    message: 'What would you like to do?',
    choices: [
      { value: 'regenerate', name: 'Regenerate with same settings' },
      { value: 'edit', name: 'Edit specific fields' },
      { value: 'restart', name: 'Start over from scratch' },
    ],
  });

  if (editChoice === 'restart') {
    return collectAnswers(name, profile);
  }

  // Start from existing values
  let startDate = existing.trip.start_date;
  let endDate = existing.trip.end_date;
  let travelers = existing.trip.travelers;
  let origin = existing.trip.origin;
  let cities = existing.cities.map(c => ({ name: c.name, key: c.key }));
  let budgetTotal = existing.budget?.total || 5000;
  let vibes = existing.preferences.priority_order;
  let antiPatterns = existing.preferences.anti_patterns;

  if (editChoice === 'edit') {
    const fieldsToEdit = await checkbox({
      message: 'Which fields to edit? (Space to select, Enter to confirm):',
      choices: [
        { value: 'dates', name: `Dates (${startDate} → ${endDate})` },
        { value: 'travelers', name: `Travelers (${travelers})` },
        { value: 'origin', name: `Origin (${origin})` },
        { value: 'cities', name: `Cities (${cities.map(c => c.name).join(', ')})` },
        { value: 'budget', name: `Budget (${budgetTotal})` },
        { value: 'vibes', name: `Vibes (${vibes.join(', ')})` },
        { value: 'anti_patterns', name: `Anti-patterns (${antiPatterns.join(', ') || 'none'})` },
      ],
    });

    if (fieldsToEdit.includes('dates')) {
      startDate = await input({ message: 'Start date (YYYY-MM-DD):', default: startDate });
      endDate = await input({ message: 'End date (YYYY-MM-DD):', default: endDate });
    }
    if (fieldsToEdit.includes('travelers')) {
      const t = await input({ message: 'Number of travelers:', default: String(travelers) });
      travelers = parseInt(t, 10);
    }
    if (fieldsToEdit.includes('origin')) {
      origin = await input({ message: 'Departing from (city):', default: origin });
    }
    if (fieldsToEdit.includes('cities')) {
      const citiesRaw = await input({
        message: 'Cities in order (comma-separated):',
        default: cities.map(c => c.name).join(', '),
      });
      cities = citiesRaw.split(',').map(c => {
        const trimmed = c.trim();
        const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_');
        return { name: trimmed, key };
      });
    }
    if (fieldsToEdit.includes('budget')) {
      const b = await input({ message: 'Total budget (USD):', default: String(budgetTotal) });
      budgetTotal = parseInt(b, 10);
    }
    if (fieldsToEdit.includes('vibes')) {
      vibes = await checkbox({
        message: 'Pick your vibes (Space to select, Enter to confirm):',
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
        ].map(c => ({ ...c, checked: vibes.includes(c.value) })),
      });
    }
    if (fieldsToEdit.includes('anti_patterns')) {
      const raw = await input({
        message: 'Anything to avoid? (comma-separated):',
        default: antiPatterns.join(', '),
      });
      antiPatterns = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
  }

  return {
    name,
    start_date: startDate,
    end_date: endDate,
    travelers,
    origin,
    cities,
    budget_total: budgetTotal,
    budget_currency: 'USD',
    vibes,
    anti_patterns: antiPatterns,
    dietary: profile.dietary,
    loyalty_program: profile.loyalty_program,
  };
}

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

  // First-time setup: profile (only if never set)
  const profileNeverSet = profile.loyalty_program === '' && profile.stated_vibes.length === 0 && profile.dietary.length === 0;
  if (profileNeverSet && !loadExisting(name)) {
    const loyalty = await select({
      message: 'Hotel loyalty program:',
      choices: [
        { value: 'marriott_bonvoy', name: 'Marriott Bonvoy' },
        { value: 'hilton_honors', name: 'Hilton Honors' },
        { value: 'ihg_rewards', name: 'IHG Rewards' },
        { value: 'hyatt', name: 'World of Hyatt' },
        { value: 'none', name: 'None' },
      ],
    });

    const dietaryChoices = await checkbox({
      message: 'Dietary restrictions (Space to select, Enter to confirm):',
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

    profile.loyalty_program = loyalty === 'none' ? '' : loyalty;
    profile.dietary = dietaryChoices;
    saveProfile(profile);
  }

  // Collect or edit trip answers
  const existing = loadExisting(name);
  let answers: InitAnswers;

  if (existing) {
    answers = await editAnswers(name, existing, profile);
  } else {
    answers = await collectAnswers(name, profile);
  }

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
  let provider;
  try {
    provider = createProvider(config);
  } catch (err) {
    console.log(chalk.red(`\n  Failed to create LLM provider: ${err instanceof Error ? err.message : String(err)}\n`));
    process.exit(1);
  }

  const spinner = ora('Generating scoring rubrics...').start();
  let rubricsYaml: string;
  try {
    rubricsYaml = await generateRubrics(provider, constraints, learnedSignals);
    spinner.succeed('Scoring rubrics generated');
  } catch (err) {
    spinner.fail('Failed to generate scoring rubrics');
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`\n  ${msg}`));
    if (msg.includes('404') || msg.includes('NOT_FOUND')) {
      console.log(chalk.yellow(`  Check that your model is available: ANTHROPIC_MODEL=${process.env.ANTHROPIC_MODEL || '(not set)'}`));
      console.log(chalk.yellow(`  Project: ${process.env.GOOGLE_CLOUD_PROJECT || '(not set)'}, Region: ${process.env.GOOGLE_CLOUD_LOCATION || '(not set)'}`));
    } else if (msg.includes('401') || msg.includes('403') || msg.includes('PERMISSION')) {
      console.log(chalk.yellow('  Check your authentication: run "gcloud auth application-default login"'));
    }
    console.log();
    process.exit(1);
  }

  spinner.start('Generating initial plan...');
  let planMd: string;
  try {
    planMd = await generatePlan(provider, constraints);
    spinner.succeed('Initial plan generated');
  } catch (err) {
    spinner.fail('Failed to generate initial plan');
    console.log(chalk.red(`\n  ${err instanceof Error ? err.message : String(err)}\n`));
    process.exit(1);
  }

  // Generate program.md (no LLM needed)
  const programMd = generateProgram(constraints, config);

  // Scaffold the trip project
  const tripDirName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const tripDir = path.resolve(tripDirName);

  if (fs.existsSync(tripDir)) {
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

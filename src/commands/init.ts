import { input, select, checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadConfig, saveConfig } from '../data/config.js';
import { loadProfile, saveProfile, type Profile } from '../data/profile.js';
import { getLearnedPath } from '../data/paths.js';
import { scaffoldTrip } from '../data/trip.js';
import { createProvider } from '../llm/factory.js';
import { generateConstraints, type InitAnswers } from '../generators/constraints.js';
import { generateRubrics } from '../generators/rubrics.js';
import { generatePlan } from '../generators/plan.js';
import { generateProgram } from '../generators/program.js';
import type { TripConstraints } from '../data/schemas.js';
import { t, setLanguage, getLanguage, type Language } from '../i18n.js';

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

function vibeChoices() {
  return [
    { value: 'wandering', name: t('vibe.wandering') },
    { value: 'food', name: t('vibe.food') },
    { value: 'culture', name: t('vibe.culture') },
    { value: 'nature', name: t('vibe.nature') },
    { value: 'adventure', name: t('vibe.adventure') },
    { value: 'relaxation', name: t('vibe.relaxation') },
    { value: 'nightlife', name: t('vibe.nightlife') },
    { value: 'history', name: t('vibe.history') },
    { value: 'shopping', name: t('vibe.shopping') },
    { value: 'family', name: t('vibe.family') },
    { value: 'romantic', name: t('vibe.romantic') },
  ];
}

async function collectAnswers(name: string, profile: Profile): Promise<InitAnswers> {
  const startDate = await input({ message: t('trip.start_date') });
  const endDate = await input({ message: t('trip.end_date') });
  const travelers = await input({ message: t('trip.travelers'), default: '2' });
  const origin = await input({ message: t('trip.origin'), default: 'Atlanta' });

  const citiesRaw = await input({
    message: t('trip.cities'),
    validate: (v) => v.includes(',') || v.length > 0 || t('trip.cities_validate'),
  });

  let cities = citiesRaw.split(',').map(c => {
    const trimmed = c.trim();
    const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return { name: trimmed, key, role: 'destination' as const };
  });

  if (cities.length > 1) {
    const transitCities = await checkbox({
      message: t('trip.transit_cities'),
      choices: cities.map(c => ({ value: c.key, name: c.name })),
    });
    cities = cities.map(c => ({
      ...c,
      role: transitCities.includes(c.key) ? 'transit' as const : 'destination' as const,
    }));
  }

  const budgetTotal = await input({ message: t('trip.budget'), default: '5000' });

  const vibes = await checkbox({
    message: t('trip.vibes'),
    choices: vibeChoices(),
  });

  const antiPatternsRaw = await input({
    message: t('trip.anti_patterns'),
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
  console.log(chalk.bold(`  ${t('edit.current_settings')}\n`));
  console.log(`    ${chalk.dim('1.')} ${t('field.dates')}:          ${chalk.white(`${existing.trip.start_date} → ${existing.trip.end_date}`)}`);
  console.log(`    ${chalk.dim('2.')} ${t('field.travelers')}:      ${chalk.white(String(existing.trip.travelers))}`);
  console.log(`    ${chalk.dim('3.')} ${t('field.origin')}:         ${chalk.white(existing.trip.origin)}`);
  console.log(`    ${chalk.dim('4.')} ${t('field.cities')}:         ${chalk.white(existing.cities.map(c => c.name).join(', '))}`);
  console.log(`    ${chalk.dim('5.')} ${t('field.budget')}:         ${chalk.white(`${existing.budget?.currency || 'USD'} ${existing.budget?.total || 5000}`)}`);
  console.log(`    ${chalk.dim('6.')} ${t('field.vibes')}:          ${chalk.white(existing.preferences.priority_order.join(', '))}`);
  console.log(`    ${chalk.dim('7.')} ${t('field.anti_patterns')}:  ${chalk.white(existing.preferences.anti_patterns.join(', ') || 'none')}`);
  console.log();

  const editChoice = await select({
    message: t('edit.what_to_do'),
    choices: [
      { value: 'regenerate', name: t('edit.regenerate') },
      { value: 'edit', name: t('edit.edit_fields') },
      { value: 'restart', name: t('edit.restart') },
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
  let cities = existing.cities.map(c => ({ name: c.name, key: c.key, role: (c.role || 'destination') as 'destination' | 'transit' }));
  let budgetTotal = existing.budget?.total || 5000;
  let vibes = existing.preferences.priority_order;
  let antiPatterns = existing.preferences.anti_patterns;

  if (editChoice === 'edit') {
    const fieldsToEdit = await checkbox({
      message: t('edit.which_fields'),
      choices: [
        { value: 'dates', name: `${t('field.dates')} (${startDate} → ${endDate})` },
        { value: 'travelers', name: `${t('field.travelers')} (${travelers})` },
        { value: 'origin', name: `${t('field.origin')} (${origin})` },
        { value: 'cities', name: `${t('field.cities')} (${cities.map(c => c.name).join(', ')})` },
        { value: 'budget', name: `${t('field.budget')} (${budgetTotal})` },
        { value: 'vibes', name: `${t('field.vibes')} (${vibes.join(', ')})` },
        { value: 'anti_patterns', name: `${t('field.anti_patterns')} (${antiPatterns.join(', ') || 'none'})` },
      ],
    });

    if (fieldsToEdit.includes('dates')) {
      startDate = await input({ message: t('trip.start_date'), default: startDate });
      endDate = await input({ message: t('trip.end_date'), default: endDate });
    }
    if (fieldsToEdit.includes('travelers')) {
      const val = await input({ message: t('trip.travelers'), default: String(travelers) });
      travelers = parseInt(val, 10);
    }
    if (fieldsToEdit.includes('origin')) {
      origin = await input({ message: t('trip.origin'), default: origin });
    }
    if (fieldsToEdit.includes('cities')) {
      const citiesRaw = await input({
        message: t('trip.cities'),
        default: cities.map(c => c.name).join(', '),
      });
      cities = citiesRaw.split(',').map(c => {
        const trimmed = c.trim();
        const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_');
        return { name: trimmed, key, role: 'destination' as const };
      });
      if (cities.length > 1) {
        const transitCities = await checkbox({
          message: t('trip.transit_cities'),
          choices: cities.map(c => ({ value: c.key, name: c.name })),
        });
        cities = cities.map(c => ({
          ...c,
          role: transitCities.includes(c.key) ? 'transit' as const : 'destination' as const,
        }));
      }
    }
    if (fieldsToEdit.includes('budget')) {
      const val = await input({ message: t('trip.budget'), default: String(budgetTotal) });
      budgetTotal = parseInt(val, 10);
    }
    if (fieldsToEdit.includes('vibes')) {
      vibes = await checkbox({
        message: t('trip.vibes'),
        choices: vibeChoices().map(c => ({ ...c, checked: vibes.includes(c.value) })),
      });
    }
    if (fieldsToEdit.includes('anti_patterns')) {
      const raw = await input({
        message: t('trip.anti_patterns'),
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

function printProviderErrorHint(cfg: ReturnType<typeof loadConfig>, msg: string): void {
  if (cfg.model_override) {
    const mo = cfg.model_override;
    if (msg.includes('401') || msg.includes('403') || msg.includes('Authentication') || msg.includes('Unauthorized')) {
      console.log(chalk.yellow(`  API key for ${mo.model} is invalid or expired.`));
      console.log(chalk.yellow(`  Run: trip-optimizer config set model_override.api_key <new-key>`));
      console.log(chalk.yellow(`  Or re-run: trip-optimizer init "${cfg.model_override.model}" to reconfigure.`));
    } else if (msg.includes('404') || msg.includes('NOT_FOUND')) {
      console.log(chalk.yellow(`  Model "${mo.model}" not found at ${mo.base_url}`));
    }
  } else if (msg.includes('401') || msg.includes('403') || msg.includes('PERMISSION')) {
    if (process.env.CLAUDE_CODE_USE_VERTEX === '1' || process.env.GOOGLE_CLOUD_PROJECT) {
      console.log(chalk.yellow(`  ${t('error.auth_check')}`));
    } else {
      console.log(chalk.yellow('  Anthropic API key is invalid. Run: trip-optimizer config set api_key <key>'));
    }
  } else if (msg.includes('404') || msg.includes('NOT_FOUND')) {
    console.log(chalk.yellow(`  ${t('error.model_check')}: ANTHROPIC_MODEL=${process.env.ANTHROPIC_MODEL || '(not set)'}`));
  }
}

export async function initCommand(name: string): Promise<void> {
  const config = loadConfig();

  // === Step 0: Language (always first) ===
  const lang = await select({
    message: t('init.language'),
    choices: [
      { value: 'en', name: 'English' },
      { value: 'zh', name: '中文（简体）' },
    ],
    default: config.language || 'en',
  }) as Language;

  setLanguage(lang);
  config.language = lang;
  saveConfig(config);

  console.log(chalk.bold(`\n  ${t('init.title')}: ${name}\n`));

  const profile = loadProfile();

  // === Step 1: Model override (ask first — determines if API key is needed) ===
  if (config.model_override) {
    const mo = config.model_override;
    const maskedKey = mo.api_key.length > 8
      ? mo.api_key.slice(0, 4) + '...' + mo.api_key.slice(-4)
      : '****';
    console.log(chalk.cyan(`  Custom model: ${mo.model}`));
    console.log(chalk.cyan(`  Base URL:     ${mo.base_url}`));
    console.log(chalk.cyan(`  API key:      ${maskedKey}\n`));

    const modelAction = await select({
      message: t('init.model_keep_or_change'),
      choices: [
        { value: 'keep', name: t('init.model_keep') },
        { value: 'edit', name: t('init.model_edit') },
        { value: 'remove', name: t('init.model_remove') },
      ],
    });

    if (modelAction === 'edit') {
      const model = await input({
        message: t('init.model_name'),
        default: mo.model,
      });
      const baseUrl = await input({
        message: t('init.model_base_url'),
        default: mo.base_url,
        validate: (v) => v.startsWith('http') || 'Must be a URL',
      });
      const apiKey = await input({
        message: t('init.model_api_key'),
        default: mo.api_key,
        validate: (v) => v.length > 0 || 'Required',
      });
      config.model_override = { provider_type: 'openai-compatible', model, base_url: baseUrl, api_key: apiKey };
      saveConfig(config);
      console.log(chalk.green(`  ${t('init.model_saved')}\n`));
    } else if (modelAction === 'remove') {
      delete config.model_override;
      saveConfig(config);
      console.log(chalk.green(`  ${t('init.model_removed')}\n`));
    }
  } else {
    const wantOverride = await select({
      message: t('init.model_override'),
      choices: [
        { value: 'no', name: t('init.model_override_no') },
        { value: 'yes', name: t('init.model_override_yes') },
      ],
    });

    if (wantOverride === 'yes') {
      const model = await input({
        message: t('init.model_name'),
        validate: (v) => v.length > 0 || 'Required',
      });
      const baseUrl = await input({
        message: t('init.model_base_url'),
        validate: (v) => v.startsWith('http') || 'Must be a URL',
      });
      const apiKey = await input({
        message: t('init.model_api_key'),
        validate: (v) => v.length > 0 || 'Required',
      });
      config.model_override = { provider_type: 'openai-compatible', model, base_url: baseUrl, api_key: apiKey };
      saveConfig(config);
      console.log(chalk.green(`\n  ${t('init.model_saved')}`));
      console.log(chalk.yellow(`  ${t('init.model_note')}\n`));
    }
  }

  // === Step 2: API key (only if no custom model and no Vertex AI) ===
  const useVertex = !!(process.env.CLAUDE_CODE_USE_VERTEX === '1' || process.env.GOOGLE_CLOUD_PROJECT);
  if (!config.model_override && !useVertex) {
    if (!config.api_key) {
      const apiKey = await input({
        message: t('init.api_key'),
        validate: (v) => v.length > 0 || 'Required',
      });
      config.api_key = apiKey;
      saveConfig(config);
    } else {
      const maskedKey = config.api_key.length > 8
        ? config.api_key.slice(0, 4) + '...' + config.api_key.slice(-4)
        : '****';
      console.log(chalk.cyan(`  Anthropic API key: ${maskedKey}\n`));
    }
  }

  // === Step 3: Profile (first-time only) ===
  const profileNeverSet = profile.loyalty_program === '' && profile.stated_vibes.length === 0 && profile.dietary.length === 0;
  if (profileNeverSet && !loadExisting(name)) {
    const loyalty = await select({
      message: t('profile.loyalty'),
      choices: [
        { value: 'marriott_bonvoy', name: 'Marriott Bonvoy' },
        { value: 'hilton_honors', name: 'Hilton Honors' },
        { value: 'ihg_rewards', name: 'IHG Rewards' },
        { value: 'hyatt', name: 'World of Hyatt' },
        { value: 'none', name: 'None' },
      ],
    });

    const dietaryChoices = await checkbox({
      message: t('profile.dietary'),
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

  // === Step 4: Trip answers ===
  const existing = loadExisting(name);
  let answers: InitAnswers;

  if (existing) {
    answers = await editAnswers(name, existing, profile);
  } else {
    answers = await collectAnswers(name, profile);
  }

  // === Step 5: Generate ===
  const constraintsYaml = generateConstraints(answers);
  const constraints = yaml.load(constraintsYaml) as TripConstraints;

  let learnedSignals: string | undefined;
  const learnedPath = getLearnedPath();
  if (fs.existsSync(learnedPath)) {
    learnedSignals = fs.readFileSync(learnedPath, 'utf-8');
  }

  let provider;
  try {
    provider = createProvider(config);
  } catch (err) {
    console.log(chalk.red(`\n  ${t('error.provider_fail')}: ${err instanceof Error ? err.message : String(err)}\n`));
    process.exit(1);
  }

  const spinner = ora(t('progress.generating_rubrics')).start();
  let rubricsYaml: string;
  try {
    rubricsYaml = await generateRubrics(provider, constraints, learnedSignals);
    spinner.succeed(t('progress.rubrics_done'));
  } catch (err) {
    spinner.fail(t('progress.rubrics_fail'));
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`\n  ${msg}`));
    printProviderErrorHint(config, msg);
    console.log();
    process.exit(1);
  }

  spinner.start(t('progress.generating_plan'));
  let planMd: string;
  try {
    planMd = await generatePlan(provider, constraints);
    spinner.succeed(t('progress.plan_done'));
  } catch (err) {
    spinner.fail(t('progress.plan_fail'));
    console.log(chalk.red(`\n  ${err instanceof Error ? err.message : String(err)}\n`));
    process.exit(1);
  }

  const programMd = generateProgram(constraints, config);

  const tripDirName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const tripDir = path.resolve(tripDirName);

  if (fs.existsSync(tripDir)) {
    fs.rmSync(tripDir, { recursive: true, force: true });
  }

  spinner.start(t('progress.creating_project'));
  await scaffoldTrip(tripDir, {
    constraints: constraintsYaml,
    rubrics: rubricsYaml,
    plan: planMd,
    program: programMd,
  });
  spinner.succeed(`${t('progress.project_created')} ${chalk.bold(tripDirName)}/`);

  console.log(`
  ${chalk.green(t('next.title'))}
    cd ${tripDirName}
    ${chalk.dim(t('next.review'))}
    trip-optimizer run
`);
}

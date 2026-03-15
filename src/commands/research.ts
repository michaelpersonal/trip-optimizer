import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import yaml from 'js-yaml';
import { simpleGit } from 'simple-git';
import { loadConfig } from '../data/config.js';
import { AnthropicProvider } from '../llm/anthropic.js';
import { researchCity, mergeResearch } from '../research/researcher.js';
import type { TripConstraints, ActivitiesDB } from '../data/schemas.js';

export async function researchCommand(cityArg?: string): Promise<void> {
  const cwd = process.cwd();

  if (!fs.existsSync(path.join(cwd, 'constraints.yaml'))) {
    console.log(chalk.red('\n  Not in a trip project directory.\n'));
    process.exit(1);
  }

  const config = loadConfig();
  if (!config.api_key) {
    console.log(chalk.red('\n  No API key configured. Run: trip-optimizer config set api_key <key>\n'));
    process.exit(1);
  }

  const constraints = yaml.load(fs.readFileSync(path.join(cwd, 'constraints.yaml'), 'utf-8')) as TripConstraints;
  const dbPath = path.join(cwd, 'activities_db.json');
  let activitiesDb: ActivitiesDB = {};
  if (fs.existsSync(dbPath)) {
    activitiesDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  }

  const provider = new AnthropicProvider(config.api_key);
  const git = simpleGit(cwd);

  // Determine which cities to research
  let cities = constraints.cities;
  if (cityArg) {
    const match = cities.find(c =>
      c.key === cityArg.toLowerCase() ||
      c.name.toLowerCase().includes(cityArg.toLowerCase())
    );
    if (!match) {
      console.log(chalk.red(`\n  City "${cityArg}" not found in constraints. Available: ${cities.map(c => c.key).join(', ')}\n`));
      process.exit(1);
    }
    cities = [match];
  }

  console.log(chalk.bold(`\n  Researching ${cities.length} cit${cities.length === 1 ? 'y' : 'ies'}...\n`));

  for (const city of cities) {
    const existingCount = (activitiesDb[city.key]?.activities?.length || 0) +
      (activitiesDb[city.key]?.restaurants?.length || 0);

    const spinner = ora(`Researching ${city.name}...`).start();
    try {
      const research = await researchCity(provider, city.key, city.name, constraints, existingCount);
      activitiesDb[city.key] = mergeResearch(activitiesDb[city.key], research);

      const newActivities = research.activities.length;
      const newRestaurants = research.restaurants.length;
      const newTraps = research.tourist_traps.length;

      spinner.succeed(`${city.name}: +${newActivities} activities, +${newRestaurants} restaurants, ${newTraps} traps identified`);
    } catch (error: any) {
      spinner.fail(`${city.name}: research failed — ${error.message}`);
    }
  }

  // Save and commit
  fs.writeFileSync(dbPath, JSON.stringify(activitiesDb, null, 2));

  try {
    await git.add('activities_db.json');
    await git.commit(`research: updated activities database for ${cities.map(c => c.name).join(', ')}`);
    console.log(chalk.green('\n  Database updated and committed.\n'));
  } catch {
    console.log(chalk.dim('\n  Database updated (no git changes to commit).\n'));
  }
}

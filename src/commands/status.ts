import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { readResults, getLastBestScore } from '../optimizer/logger.js';
import type { TripConstraints, ActivitiesDB } from '../data/schemas.js';

export function statusCommand(): void {
  const cwd = process.cwd();

  if (!fs.existsSync(path.join(cwd, 'constraints.yaml'))) {
    console.log(chalk.red('\n  Not in a trip project directory.\n'));
    process.exit(1);
  }

  const constraints = yaml.load(fs.readFileSync(path.join(cwd, 'constraints.yaml'), 'utf-8')) as TripConstraints;
  const resultsPath = path.join(cwd, 'results.tsv');
  const results = readResults(resultsPath);

  if (results.length === 0) {
    console.log(chalk.yellow('\n  No optimization results yet. Run: trip-optimizer run\n'));
    return;
  }

  const lastBest = getLastBestScore(resultsPath);
  const baseline = results[0]?.score_after || 0;
  const totalIterations = results[results.length - 1].iteration;
  const keeps = results.filter(r => r.status === 'keep').length;
  const last5 = results.slice(-5);

  // Count consecutive streak from end
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].status === results[results.length - 1].status) streak++;
    else break;
  }
  const streakType = results[results.length - 1].status;

  console.log(chalk.bold(`\n  ${constraints.trip?.name || 'Trip'} -- iteration ${totalIterations}\n`));
  console.log(`  Score: ${chalk.bold(lastBest?.score.toFixed(2) || '?')}/100  (${baseline > 0 ? `+${(lastBest!.score - baseline).toFixed(1)} from baseline` : ''})`);
  console.log(`  Iterations: ${totalIterations} (${keeps} kept, ${totalIterations - keeps} discarded)`);
  console.log(`  Streak: ${streak} ${streakType}s in a row`);

  console.log(chalk.bold('\n  Last 5 mutations:'));
  for (const r of last5) {
    const icon = r.status === 'keep' ? chalk.green('\u2713') : chalk.red('\u2717');
    const delta = r.delta >= 0 ? `+${r.delta.toFixed(2)}` : r.delta.toFixed(2);
    console.log(`    ${icon} ${r.mutation_type.padEnd(10)} ${r.description.substring(0, 50)}  ${delta}`);
  }

  // Research coverage
  const dbPath = path.join(cwd, 'activities_db.json');
  if (fs.existsSync(dbPath)) {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as ActivitiesDB;
    const cities = Object.entries(db);
    if (cities.length > 0) {
      console.log(chalk.bold('\n  Research coverage:'));
      for (const [city, data] of cities) {
        const count = (data.activities?.length || 0) + (data.restaurants?.length || 0);
        const bar = '\u2588'.repeat(Math.min(count, 30));
        console.log(`    ${city.padEnd(15)} ${bar} ${count}`);
      }
    }
  }

  console.log();
}

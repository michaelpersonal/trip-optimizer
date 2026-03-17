import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { readResults, getLastBestScore } from '../optimizer/logger.js';
import type { TripConstraints, ActivitiesDB, AbsoluteScoreResult } from '../data/schemas.js';

function progressBar(value: number, max: number, width: number = 30): string {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
  return `[${bar}]`;
}

function trendArrow(current: number, previous: number): string {
  const diff = current - previous;
  if (diff > 0.5) return chalk.green('\u2191');
  if (diff < -0.5) return chalk.red('\u2193');
  return chalk.gray('\u2192');
}

function renderDashboard(tripDir?: string): void {
  const cwd = tripDir || process.cwd();

  if (!fs.existsSync(path.join(cwd, 'constraints.yaml'))) {
    console.log(chalk.red('\n  Not in a trip project directory.\n'));
    process.exit(1);
  }

  const constraints = yaml.load(
    fs.readFileSync(path.join(cwd, 'constraints.yaml'), 'utf-8')
  ) as TripConstraints;

  const resultsPath = path.join(cwd, 'results.tsv');
  const results = readResults(resultsPath);

  // Header
  console.log(chalk.bold.cyan(`\n  === ${constraints.trip?.name || 'Trip Optimizer'} Dashboard ===\n`));

  if (results.length === 0) {
    console.log(chalk.yellow('  No optimization results yet. Run: trip-optimizer run\n'));
    return;
  }

  // Current score with progress bar
  const lastBest = getLastBestScore(resultsPath);
  const score = isNaN(lastBest?.score ?? 0) ? 0 : (lastBest?.score ?? 0);
  console.log(`  Score: ${progressBar(score, 100)} ${chalk.bold(score.toFixed(2))}/100`);

  // Dimension scores from score.json
  const scorePath = path.join(cwd, 'score.json');
  if (fs.existsSync(scorePath)) {
    try {
      const scoreData = JSON.parse(fs.readFileSync(scorePath, 'utf-8')) as AbsoluteScoreResult;
      if (scoreData.components) {
        console.log(chalk.bold('\n  Dimensions:'));

        // Find previous score data for trends (use second-to-last keep)
        const keeps = results.filter(r => r.status === 'keep');
        const prevScore = keeps.length >= 2 ? keeps[keeps.length - 2].score_after : score;

        for (const [dim, result] of Object.entries(scoreData.components)) {
          const dimScore = result.score;
          const arrow = trendArrow(dimScore, prevScore > 0 ? dimScore : dimScore); // approximate trend
          const bar = progressBar(dimScore, 100, 15);
          const penalty = result.penalty ? chalk.red(` (-${result.penalty})`) : '';
          console.log(`    ${dim.padEnd(18)} ${bar} ${dimScore.toFixed(1)}${penalty} ${arrow}`);
        }

        // Penalties
        if (scoreData.penalties && scoreData.penalties.length > 0) {
          console.log(chalk.bold.red(`\n  Penalties: ${scoreData.penalties.length} remaining`));
          for (const p of scoreData.penalties.slice(0, 5)) {
            console.log(chalk.red(`    -${p.penalty}  Day ${p.day}: ${p.issue.substring(0, 60)}`));
          }
          if (scoreData.penalties.length > 5) {
            console.log(chalk.gray(`    ... and ${scoreData.penalties.length - 5} more`));
          }
        }
      }
    } catch {
      // score.json may be malformed, skip
    }
  }

  // Last 5 mutations
  const last5 = results.slice(-5);
  console.log(chalk.bold('\n  Recent Mutations:'));
  for (const r of last5) {
    const icon = r.status === 'keep' ? chalk.green('\u2713') : chalk.red('\u2717');
    const d = isNaN(r.delta) ? 0 : r.delta;
    const delta = d >= 0 ? chalk.green(`+${d.toFixed(2)}`) : chalk.red(d.toFixed(2));
    const mtype = (r.mutation_type || 'unknown').padEnd(10);
    const desc = (r.description || '').substring(0, 45).padEnd(45);
    console.log(`    ${icon} #${String(r.iteration || 0).padStart(3)} ${mtype} ${desc} ${delta}`);
  }

  // Stats
  const totalIterations = results[results.length - 1].iteration;
  const keeps = results.filter(r => r.status === 'keep').length;
  const keepRate = ((keeps / results.length) * 100).toFixed(1);
  const baseline = results[0]?.score_after || 0;
  const totalDelta = score - baseline;

  console.log(chalk.bold('\n  Stats:'));
  console.log(`    Iterations:  ${totalIterations}`);
  console.log(`    Keep rate:   ${keepRate}% (${keeps}/${results.length})`);
  console.log(`    Baseline:    ${baseline.toFixed(2)}`);
  console.log(`    Total delta: ${totalDelta >= 0 ? chalk.green(`+${totalDelta.toFixed(2)}`) : chalk.red(totalDelta.toFixed(2))}`);

  // Research coverage
  const dbPath = path.join(cwd, 'activities_db.json');
  if (fs.existsSync(dbPath)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as ActivitiesDB;
      const cities = Object.entries(db);
      if (cities.length > 0) {
        console.log(chalk.bold('\n  Research Coverage:'));
        for (const [city, data] of cities) {
          const activities = data.activities?.length || 0;
          const restaurants = data.restaurants?.length || 0;
          const total = activities + restaurants;
          const bar = progressBar(Math.min(total, 50), 50, 15);
          console.log(`    ${city.padEnd(15)} ${bar} ${chalk.cyan(`${activities}a`)} ${chalk.yellow(`${restaurants}r`)}`);
        }
      }
    } catch {
      // skip malformed db
    }
  }

  console.log();
}

export function dashboardCommand(options: { watch?: boolean }): void {
  // Capture cwd once at startup — git resets during optimization can delete the directory
  const tripDir = process.cwd();

  if (options.watch) {
    const render = (): void => {
      try {
        process.stdout.write('\x1B[2J\x1B[0f'); // clear terminal
        renderDashboard(tripDir);
        console.log(chalk.gray('  Auto-refreshing every 5s. Press Ctrl+C to stop.'));
      } catch (err: any) {
        // Directory may be temporarily gone during git reset
        process.stdout.write('\x1B[2J\x1B[0f');
        console.log(chalk.yellow('\n  Waiting for optimizer... (directory in flux)\n'));
      }
    };
    render();
    setInterval(render, 5000);
  } else {
    renderDashboard(tripDir);
  }
}

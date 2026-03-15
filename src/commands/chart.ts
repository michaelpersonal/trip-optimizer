import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
// @ts-ignore -- asciichart has no type declarations
import asciichart from 'asciichart';
import { readResults } from '../optimizer/logger.js';

export function chartCommand(): void {
  const cwd = process.cwd();
  const resultsPath = path.join(cwd, 'results.tsv');
  const results = readResults(resultsPath);

  if (results.length === 0) {
    console.log(chalk.yellow('\n  No optimization results yet. Run: trip-optimizer run\n'));
    return;
  }

  // Build score progression from kept mutations
  // Track the "current best" score over time
  const scores: number[] = [];
  let currentBest = results[0].score_before;
  scores.push(currentBest);

  for (const r of results) {
    if (r.status === 'keep') {
      currentBest = r.score_after;
    }
    scores.push(currentBest);
  }

  console.log(chalk.bold.cyan('\n  Score Progression'));
  console.log(chalk.gray(`  ${results.length} iterations, ${results.filter(r => r.status === 'keep').length} kept\n`));

  // Determine terminal width for chart
  const width = Math.min(process.stdout.columns || 80, 120) - 15;
  const chartHeight = 15;

  // Downsample if too many data points
  let plotData = scores;
  if (scores.length > width) {
    const step = scores.length / width;
    plotData = [];
    for (let i = 0; i < width; i++) {
      plotData.push(scores[Math.floor(i * step)]);
    }
  }

  const chart = asciichart.plot(plotData, {
    height: chartHeight,
    format: (x: number) => x.toFixed(1).padStart(6),
  });

  console.log(chart);

  // Summary line
  const first = scores[0];
  const last = scores[scores.length - 1];
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  console.log();
  console.log(`  Start: ${chalk.gray(first.toFixed(2))}  Current: ${chalk.bold(last.toFixed(2))}  Peak: ${chalk.green(max.toFixed(2))}  Low: ${chalk.red(min.toFixed(2))}`);
  console.log();
}

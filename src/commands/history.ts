import chalk from 'chalk';
import fs from 'fs';
import { getTripHistoryPath } from '../data/paths.js';
import type { TripDebrief } from '../memory/debrief-processor.js';

export async function historyCommand(): Promise<void> {
  const historyPath = getTripHistoryPath();

  if (!fs.existsSync(historyPath)) {
    console.log(chalk.yellow('\n  No trip history found.'));
    console.log(chalk.dim('  Complete a trip and run "trip-optimizer debrief" to build history.\n'));
    return;
  }

  const history: TripDebrief[] = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));

  if (history.length === 0) {
    console.log(chalk.yellow('\n  No trip debriefs recorded yet.\n'));
    return;
  }

  console.log(chalk.bold('\n  Trip History\n'));

  // Table header
  const nameWidth = 30;
  const dateWidth = 12;
  const ratingWidth = 8;
  const daysWidth = 6;

  const header =
    '  ' +
    'Trip'.padEnd(nameWidth) +
    'Date'.padEnd(dateWidth) +
    'Rating'.padEnd(ratingWidth) +
    'Days'.padEnd(daysWidth);

  console.log(chalk.dim(header));
  console.log(chalk.dim('  ' + '-'.repeat(nameWidth + dateWidth + ratingWidth + daysWidth)));

  for (const trip of history) {
    const stars = '\u2605'.repeat(trip.overall_rating) + '\u2606'.repeat(5 - trip.overall_rating);
    const name = trip.trip_name.length > nameWidth - 2
      ? trip.trip_name.substring(0, nameWidth - 5) + '...'
      : trip.trip_name;

    const line =
      '  ' +
      name.padEnd(nameWidth) +
      trip.debrief_date.padEnd(dateWidth) +
      stars.padEnd(ratingWidth) +
      String(trip.day_ratings.length).padEnd(daysWidth);

    console.log(line);
  }

  console.log('');

  // Summary
  const avgRating = history.reduce((s, t) => s + t.overall_rating, 0) / history.length;
  console.log(chalk.dim(`  ${history.length} trip(s) | Average rating: ${avgRating.toFixed(1)}/5\n`));
}

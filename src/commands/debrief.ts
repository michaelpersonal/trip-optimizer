import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { loadConfig } from '../data/config.js';
import { loadProfile, saveProfile } from '../data/profile.js';
import { getTripHistoryPath, getLearnedPath, getGlobalDir } from '../data/paths.js';
import { AnthropicProvider } from '../llm/anthropic.js';
import type { TripDebrief } from '../memory/debrief-processor.js';
import { processDebrief } from '../memory/debrief-processor.js';
import { generateLearnedSignals } from '../memory/learned-generator.js';

function parseDays(planContent: string): Array<{ day: number; content: string }> {
  const dayPattern = /^## Day (\d+)/gm;
  const days: Array<{ day: number; content: string }> = [];
  let match: RegExpExecArray | null;
  const matches: Array<{ day: number; index: number }> = [];

  while ((match = dayPattern.exec(planContent)) !== null) {
    matches.push({ day: parseInt(match[1], 10), index: match.index });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : planContent.length;
    days.push({
      day: matches[i].day,
      content: planContent.substring(start, end).trim(),
    });
  }

  return days;
}

export async function debriefCommand(): Promise<void> {
  console.log(chalk.bold('\n  Post-Trip Debrief\n'));

  // Find plan.md in current directory
  const planPath = path.resolve('plan.md');
  if (!fs.existsSync(planPath)) {
    console.log(chalk.red('  No plan.md found in current directory.'));
    console.log(chalk.dim('  Run this command from a trip project directory.\n'));
    return;
  }

  const planContent = fs.readFileSync(planPath, 'utf-8');
  const days = parseDays(planContent);

  if (days.length === 0) {
    console.log(chalk.red('  No day sections found in plan.md.'));
    console.log(chalk.dim('  Expected headers like "## Day 1", "## Day 2", etc.\n'));
    return;
  }

  const tripName = path.basename(process.cwd());

  console.log(chalk.cyan(`  Trip: ${tripName}`));
  console.log(chalk.cyan(`  Days found: ${days.length}\n`));

  const ratingChoices = [
    { value: 1, name: '1 - Terrible' },
    { value: 2, name: '2 - Below average' },
    { value: 3, name: '3 - Average' },
    { value: 4, name: '4 - Good' },
    { value: 5, name: '5 - Excellent' },
  ];

  const surpriseChoices = [
    { value: 'better' as const, name: 'Better than expected' },
    { value: 'expected' as const, name: 'As expected' },
    { value: 'worse' as const, name: 'Worse than expected' },
  ];

  // Rate each day
  const dayRatings: TripDebrief['day_ratings'] = [];

  for (const day of days) {
    console.log(chalk.bold(`\n  --- Day ${day.day} ---`));
    // Show a preview (first 5 lines after header)
    const lines = day.content.split('\n');
    const preview = lines.slice(0, 6).join('\n');
    console.log(chalk.dim(preview));
    console.log('');

    const rating = await select({
      message: `Day ${day.day} rating:`,
      choices: ratingChoices,
    });

    const surprise = await select({
      message: `Day ${day.day} surprise level:`,
      choices: surpriseChoices,
    });

    const notes = await input({
      message: `Day ${day.day} notes (optional):`,
      default: '',
    });

    dayRatings.push({
      day: day.day,
      rating,
      surprise,
      notes,
    });
  }

  // Overall trip questions
  console.log(chalk.bold('\n  --- Overall Trip ---\n'));

  const overallRating = await select({
    message: 'Overall trip rating:',
    choices: ratingChoices,
  });

  const skipNextTime = await input({
    message: 'What would you skip next time? (comma-separated)',
    default: '',
  });

  const highlights = await input({
    message: 'What unexpected highlights?',
    default: '',
  });

  const newAntiPatterns = await input({
    message: 'Any new anti-patterns discovered? (comma-separated)',
    default: '',
  });

  // Build debrief object
  const debrief: TripDebrief = {
    trip_name: tripName,
    trip_dir: process.cwd(),
    debrief_date: new Date().toISOString().split('T')[0],
    overall_rating: overallRating,
    day_ratings: dayRatings,
    skip_next_time: skipNextTime,
    unexpected_highlights: highlights,
    new_anti_patterns: newAntiPatterns,
  };

  // Save to trip-history.json
  const globalDir = getGlobalDir();
  fs.mkdirSync(globalDir, { recursive: true });

  const historyPath = getTripHistoryPath();
  let history: TripDebrief[] = [];
  if (fs.existsSync(historyPath)) {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
  }
  history.push(debrief);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

  console.log(chalk.green('\n  Debrief saved to trip history.'));

  // Process debrief
  const processed = processDebrief(debrief);
  console.log(chalk.dim(`  Average day rating: ${processed.avgRating}`));
  if (processed.betterThanExpected.length > 0) {
    console.log(chalk.dim(`  Better than expected: Days ${processed.betterThanExpected.join(', ')}`));
  }
  if (processed.worseThanExpected.length > 0) {
    console.log(chalk.dim(`  Worse than expected: Days ${processed.worseThanExpected.join(', ')}`));
  }

  // Generate learned signals via LLM
  const config = loadConfig();
  if (config.api_key) {
    const spinner = ora('Generating learned preferences from debrief history...').start();
    try {
      const provider = new AnthropicProvider(config.api_key);
      const learned = await generateLearnedSignals(provider, history);

      const learnedPath = getLearnedPath();
      fs.writeFileSync(learnedPath, JSON.stringify(learned, null, 2));
      spinner.succeed('Learned preferences updated');

      // Update profile
      const profile = loadProfile();
      if (learned.preference_signals.length > 0) {
        profile.learned_vibes = learned.preference_signals;
      }
      if (learned.anti_patterns_learned.length > 0) {
        profile.anti_patterns_learned = learned.anti_patterns_learned;
      }
      if (Object.keys(learned.source_reliability).length > 0) {
        profile.source_trust = learned.source_reliability;
      }
      profile.trips_completed = history.length;
      profile.last_debrief = debrief.debrief_date;
      saveProfile(profile);

      console.log(chalk.green('  Profile updated with learned preferences.\n'));
    } catch (err) {
      spinner.fail('Could not generate learned preferences (LLM error)');
      console.log(chalk.dim(`  ${err instanceof Error ? err.message : String(err)}\n`));

      // Still update trips_completed even if LLM fails
      const profile = loadProfile();
      profile.trips_completed = history.length;
      profile.last_debrief = debrief.debrief_date;
      saveProfile(profile);
    }
  } else {
    console.log(chalk.yellow('  No API key configured — skipping learned preferences generation.'));
    console.log(chalk.dim('  Run "trip-optimizer config set api_key <key>" to enable.\n'));

    const profile = loadProfile();
    profile.trips_completed = history.length;
    profile.last_debrief = debrief.debrief_date;
    saveProfile(profile);
  }
}

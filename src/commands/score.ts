import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { loadConfig } from '../data/config.js';
import { AnthropicProvider } from '../llm/anthropic.js';
import { Scorer } from '../scoring/scorer.js';
import type { Rubrics, TripConstraints, ActivitiesDB } from '../data/schemas.js';

export async function scoreCommand(): Promise<void> {
  const cwd = process.cwd();

  // Verify we're in a trip project
  const constraintsPath = path.join(cwd, 'constraints.yaml');
  if (!fs.existsSync(constraintsPath)) {
    console.log(chalk.red('\n  Not in a trip project directory (no constraints.yaml found).\n'));
    process.exit(1);
  }

  const config = loadConfig();
  if (!config.api_key) {
    console.log(chalk.red('\n  No API key configured. Run: trip-optimizer config set api_key <key>\n'));
    process.exit(1);
  }

  // Load trip files
  const constraints = yaml.load(fs.readFileSync(constraintsPath, 'utf-8')) as TripConstraints;
  const rubrics = yaml.load(fs.readFileSync(path.join(cwd, 'rubrics.yaml'), 'utf-8')) as Rubrics;
  const planContent = fs.readFileSync(path.join(cwd, 'plan.md'), 'utf-8');

  let activitiesDb: ActivitiesDB = {};
  const dbPath = path.join(cwd, 'activities_db.json');
  if (fs.existsSync(dbPath)) {
    activitiesDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  }

  console.log(chalk.bold(`\n  Scoring ${constraints.trip?.name || 'trip'} (absolute mode)...\n`));

  const provider = new AnthropicProvider(config.api_key);
  const scorer = new Scorer(provider);
  const result = await scorer.scoreAbsolute(planContent, activitiesDb, constraints, rubrics);

  // Write score.json
  fs.writeFileSync(path.join(cwd, 'score.json'), JSON.stringify(result, null, 2));

  // Print results
  console.log(chalk.bold(`\n  Composite Score: ${result.composite_score.toFixed(2)}/100\n`));

  console.log(chalk.bold('  Dimension Scores:'));
  for (const [dim, data] of Object.entries(result.components)) {
    const extras: string[] = [];
    if (data.penalty) extras.push(`penalty: ${data.penalty}`);
    if (data.holistic_adjustment) extras.push(`holistic: ${data.holistic_adjustment > 0 ? '+' : ''}${data.holistic_adjustment}`);
    const extraStr = extras.length > 0 ? chalk.dim(` (${extras.join(', ')})`) : '';
    console.log(`    ${dim}: ${data.score.toFixed(1)} ${chalk.dim(`(w=${data.weight})`)}${extraStr}`);

    for (const [sd, info] of Object.entries(data.sub_dimensions)) {
      console.log(`      ${chalk.dim(sd)}: ${info.score.toFixed(0)} — ${chalk.dim(info.note)}`);
    }
  }

  if (result.penalties.length > 0) {
    console.log(chalk.bold(`\n  Adversarial Penalties (${result.penalties.length}):`));
    for (const p of result.penalties) {
      console.log(`    Day ${p.day}: ${p.issue} ${chalk.red(`(${p.penalty})`)}`);
    }
  }

  if (result.holistic_adjustments.length > 0) {
    console.log(chalk.bold(`\n  Holistic Adjustments (${result.holistic_adjustments.length}):`));
    for (const a of result.holistic_adjustments) {
      console.log(`    ${a.dimension}: ${a.adjustment > 0 ? '+' : ''}${a.adjustment} — ${a.reason}`);
    }
  }

  console.log(chalk.dim(`\n  Results written to score.json\n`));
}

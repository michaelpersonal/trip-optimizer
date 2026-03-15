import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { simpleGit } from 'simple-git';
import type { LLMProvider } from '../llm/provider.js';
import type { TripConstraints, Rubrics, ActivitiesDB, IterationLog } from '../data/schemas.js';
import { Scorer } from '../scoring/scorer.js';
import { pickMutationType, generateMutation } from './mutations.js';
import { appendResult, readResults, getLastBestScore } from './logger.js';

export interface LoopOptions {
  provider: LLMProvider;
  tripDir: string;
  recalibrationInterval?: number;
  onIteration?: (log: IterationLog) => void;
}

export async function runOptimizationLoop(options: LoopOptions): Promise<void> {
  const {
    provider,
    tripDir,
    recalibrationInterval = 10,
    onIteration,
  } = options;

  const git = simpleGit(tripDir);
  const resultsPath = path.join(tripDir, 'results.tsv');
  const constraintsPath = path.join(tripDir, 'constraints.yaml');
  const rubricsPath = path.join(tripDir, 'rubrics.yaml');
  const planPath = path.join(tripDir, 'plan.md');
  const dbPath = path.join(tripDir, 'activities_db.json');

  // Load static files
  const constraints = yaml.load(fs.readFileSync(constraintsPath, 'utf-8')) as TripConstraints;
  const rubrics = yaml.load(fs.readFileSync(rubricsPath, 'utf-8')) as Rubrics;
  const scorer = new Scorer(provider);

  // Check for crash recovery
  const lastBest = getLastBestScore(resultsPath);
  let currentScore: number;
  let iteration: number;

  if (lastBest) {
    currentScore = lastBest.score;
    iteration = lastBest.iteration + 1;
    console.log(`  Resuming from iteration ${iteration} (score: ${currentScore.toFixed(2)})`);
  } else {
    // Score baseline
    console.log('  Scoring baseline...');
    const planContent = fs.readFileSync(planPath, 'utf-8');
    const activitiesDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as ActivitiesDB;
    const baselineResult = await scorer.scoreAbsolute(planContent, activitiesDb, constraints, rubrics);
    currentScore = baselineResult.composite_score;

    fs.writeFileSync(path.join(tripDir, 'score.json'), JSON.stringify(baselineResult, null, 2));

    const log: IterationLog = {
      iteration: 0,
      commit: (await git.revparse(['HEAD'])).trim(),
      score_before: 0,
      score_after: currentScore,
      delta: currentScore,
      status: 'keep',
      mutation_type: 'RESEARCH',
      description: 'baseline scored',
    };
    appendResult(resultsPath, log);
    onIteration?.(log);

    console.log(`  Baseline score: ${currentScore.toFixed(2)}/100`);
    iteration = 1;
  }

  let consecutiveDiscards = 0;
  console.log('  Starting optimization loop (Ctrl+C to stop)');
  console.log(`  Score: ${currentScore.toFixed(2)}/100\n`);

  // Handle graceful shutdown
  let running = true;
  const shutdown = () => {
    running = false;
    console.log('\n  Stopping after current iteration...');
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (running) {
    const planContent = fs.readFileSync(planPath, 'utf-8');
    const activitiesDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as ActivitiesDB;

    // Pick mutation type
    const mutationType = pickMutationType(iteration, consecutiveDiscards);

    try {
      // Generate mutation
      process.stdout.write(`  [${iteration}] ${mutationType} — generating mutation...`);
      const mutation = await generateMutation(
        provider,
        mutationType,
        planContent,
        constraints,
        activitiesDb,
      );
      process.stdout.write('\r\x1b[K'); // clear line

      // Apply mutation
      fs.writeFileSync(planPath, mutation.newPlanContent);
      await git.add('plan.md');
      await git.commit(`${mutationType}: ${mutation.description}`);

      const commitHash = (await git.revparse(['HEAD'])).trim().substring(0, 7);

      // Score
      let scoreAfter: number;
      let verdict: string;

      const isRecalibration = iteration % recalibrationInterval === 0;
      process.stdout.write(`  [${iteration}] ${mutationType} — scoring (${isRecalibration ? 'absolute' : 'comparative'})...`);

      if (isRecalibration) {
        // Full absolute scoring for recalibration
        const result = await scorer.scoreAbsolute(
          mutation.newPlanContent,
          activitiesDb,
          constraints,
          rubrics,
          (msg) => {}, // silent logging during loop
        );
        scoreAfter = result.composite_score;
        verdict = scoreAfter > currentScore ? 'better' : scoreAfter < currentScore ? 'worse' : 'neutral';
        fs.writeFileSync(path.join(tripDir, 'score.json'), JSON.stringify(result, null, 2));
      } else {
        // Comparative scoring
        const result = await scorer.scoreComparative(
          planContent,
          mutation.newPlanContent,
          mutation.description,
          rubrics,
          (msg) => {}, // silent
        );
        scoreAfter = currentScore + result.composite_delta;
        verdict = result.verdict;
      }
      process.stdout.write('\r\x1b[K'); // clear line

      const delta = scoreAfter - currentScore;
      const status = verdict === 'better' ? 'keep' as const : 'discard' as const;

      if (status === 'keep') {
        currentScore = scoreAfter;
        consecutiveDiscards = 0;
      } else {
        // Revert
        await git.reset(['--hard', 'HEAD~1']);
        consecutiveDiscards++;
      }

      const log: IterationLog = {
        iteration,
        commit: commitHash,
        score_before: currentScore - (status === 'keep' ? delta : 0),
        score_after: scoreAfter,
        delta,
        status,
        mutation_type: mutationType,
        description: mutation.description,
      };

      appendResult(resultsPath, log);
      onIteration?.(log);

      const statusIcon = status === 'keep' ? '\x1b[32m\u2713\x1b[0m' : '\x1b[31m\u2717\x1b[0m';
      const deltaStr = delta >= 0 ? `\x1b[32m+${delta.toFixed(2)}\x1b[0m` : `\x1b[31m${delta.toFixed(2)}\x1b[0m`;
      const scoreStr = `\x1b[1m${currentScore.toFixed(2)}\x1b[0m`;
      console.log(`  [${iteration}] ${statusIcon} ${mutationType.padEnd(10)} ${deltaStr}  ${scoreStr}  ${mutation.description.substring(0, 60)}`);

    } catch (error: any) {
      console.log(`  [${iteration}] ERROR: ${error.message} -- reverting`);
      try {
        await git.reset(['--hard', 'HEAD']);
      } catch {}
      consecutiveDiscards++;
    }

    iteration++;
  }

  process.removeListener('SIGINT', shutdown);
  process.removeListener('SIGTERM', shutdown);
  console.log(`\n  Stopped at iteration ${iteration - 1}. Best score: ${currentScore.toFixed(2)}/100\n`);
}

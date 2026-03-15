import fs from 'fs';
import type { IterationLog } from '../data/schemas.js';

const HEADER = 'iteration\tcommit\tscore_before\tscore_after\tdelta\tstatus\tmutation_type\tdescription';

export function appendResult(resultsPath: string, log: IterationLog): void {
  if (!fs.existsSync(resultsPath)) {
    fs.writeFileSync(resultsPath, HEADER + '\n');
  }
  const line = [
    log.iteration,
    log.commit,
    log.score_before.toFixed(2),
    log.score_after.toFixed(2),
    (log.delta >= 0 ? '+' : '') + log.delta.toFixed(2),
    log.status,
    log.mutation_type,
    log.description,
  ].join('\t');
  fs.appendFileSync(resultsPath, line + '\n');
}

export function readResults(resultsPath: string): IterationLog[] {
  if (!fs.existsSync(resultsPath)) return [];
  const lines = fs.readFileSync(resultsPath, 'utf-8').split('\n').filter(Boolean);
  if (lines.length <= 1) return []; // Just header

  return lines.slice(1).map(line => {
    const parts = line.split('\t');
    return {
      iteration: parseInt(parts[0], 10) || 0,
      commit: parts[1] || '',
      score_before: parseFloat(parts[2]) || 0,
      score_after: parseFloat(parts[3]) || 0,
      delta: parseFloat(parts[4]) || 0,
      status: (parts[5] as 'keep' | 'discard') || 'discard',
      mutation_type: (parts[6] as any) || 'unknown',
      description: parts[7] || '',
    };
  });
}

export function getLastBestScore(resultsPath: string): { score: number; iteration: number } | null {
  const results = readResults(resultsPath);
  if (results.length === 0) return null;

  // Find last "keep" entry
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].status === 'keep') {
      return { score: results[i].score_after, iteration: results[i].iteration };
    }
  }

  // If no keeps, return baseline
  return { score: results[0].score_after, iteration: results[0].iteration };
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendResult, readResults, getLastBestScore } from '../../src/optimizer/logger.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('logger', () => {
  const testDir = path.join(os.tmpdir(), 'trip-opt-logger-' + Date.now());
  const resultsPath = path.join(testDir, 'results.tsv');

  beforeEach(() => fs.mkdirSync(testDir, { recursive: true }));
  afterEach(() => fs.rmSync(testDir, { recursive: true, force: true }));

  it('creates file with header on first write', () => {
    appendResult(resultsPath, {
      iteration: 0, commit: 'abc1234', score_before: 0, score_after: 72.5,
      delta: 72.5, status: 'keep', mutation_type: 'RESEARCH', description: 'baseline',
    });
    const content = fs.readFileSync(resultsPath, 'utf-8');
    expect(content).toContain('iteration\tcommit');
    expect(content).toContain('72.50');
  });

  it('reads results back', () => {
    appendResult(resultsPath, {
      iteration: 0, commit: 'abc', score_before: 0, score_after: 72.5,
      delta: 72.5, status: 'keep', mutation_type: 'RESEARCH', description: 'baseline',
    });
    appendResult(resultsPath, {
      iteration: 1, commit: 'def', score_before: 72.5, score_after: 73.0,
      delta: 0.5, status: 'keep', mutation_type: 'SWAP', description: 'swapped stuff',
    });

    const results = readResults(resultsPath);
    expect(results).toHaveLength(2);
    expect(results[0].iteration).toBe(0);
    expect(results[1].status).toBe('keep');
  });

  it('returns null for empty results', () => {
    expect(getLastBestScore(resultsPath)).toBeNull();
  });

  it('finds last best score', () => {
    appendResult(resultsPath, {
      iteration: 0, commit: 'abc', score_before: 0, score_after: 72,
      delta: 72, status: 'keep', mutation_type: 'RESEARCH', description: 'baseline',
    });
    appendResult(resultsPath, {
      iteration: 1, commit: 'def', score_before: 72, score_after: 71,
      delta: -1, status: 'discard', mutation_type: 'SWAP', description: 'bad swap',
    });
    appendResult(resultsPath, {
      iteration: 2, commit: 'ghi', score_before: 72, score_after: 74,
      delta: 2, status: 'keep', mutation_type: 'UPGRADE', description: 'good upgrade',
    });

    const best = getLastBestScore(resultsPath);
    expect(best?.score).toBe(74);
    expect(best?.iteration).toBe(2);
  });
});

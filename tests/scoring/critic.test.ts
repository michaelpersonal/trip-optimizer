import { describe, it, expect } from 'vitest';
import { mapPenaltyToDimension, applyPenalties } from '../../src/scoring/critic.js';
import type { DimensionResult } from '../../src/data/schemas.js';

describe('mapPenaltyToDimension', () => {
  it('maps logistics to logistics_efficiency', () => {
    expect(mapPenaltyToDimension('logistics')).toBe('logistics_efficiency');
  });

  it('maps food to food_score', () => {
    expect(mapPenaltyToDimension('food')).toBe('food_score');
  });

  it('maps experience to experience_quality', () => {
    expect(mapPenaltyToDimension('experience')).toBe('experience_quality');
  });

  it('defaults to logistics_efficiency for unknown', () => {
    expect(mapPenaltyToDimension('unknown')).toBe('logistics_efficiency');
  });
});

describe('applyPenalties', () => {
  it('applies penalties to correct dimensions', () => {
    const scores: Record<string, DimensionResult> = {
      food_score: { score: 85, weight: 0.2, sub_dimensions: {} },
      logistics_efficiency: { score: 80, weight: 0.3, sub_dimensions: {} },
    };

    applyPenalties(scores, [
      { category: 'food', day: 3, issue: 'generic restaurant', penalty: -5 },
    ]);

    expect(scores.food_score.score).toBe(80);
    expect(scores.food_score.penalty).toBe(-5);
    expect(scores.food_score.score_before_penalty).toBe(85);
  });

  it('caps penalties per dimension', () => {
    const scores: Record<string, DimensionResult> = {
      logistics_efficiency: { score: 85, weight: 0.3, sub_dimensions: {} },
    };

    applyPenalties(scores, [
      { category: 'logistics', day: 1, issue: 'issue 1', penalty: -10 },
      { category: 'logistics', day: 2, issue: 'issue 2', penalty: -10 },
      { category: 'logistics', day: 3, issue: 'issue 3', penalty: -10 },
    ], -20);

    expect(scores.logistics_efficiency.penalty).toBe(-20);
    expect(scores.logistics_efficiency.score).toBe(65);
  });

  it('does not go below 0', () => {
    const scores: Record<string, DimensionResult> = {
      food_score: { score: 10, weight: 0.2, sub_dimensions: {} },
    };

    applyPenalties(scores, [
      { category: 'food', day: 1, issue: 'bad', penalty: -20 },
    ]);

    expect(scores.food_score.score).toBe(0);
  });
});

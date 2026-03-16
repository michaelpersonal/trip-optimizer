import type { LLMProvider } from '../llm/provider.js';
import type { Penalty, Rubrics, ActivitiesDB, DimensionResult } from '../data/schemas.js';
import { buildCriticPrompt } from './prompts.js';
import { parseJsonResponse } from '../llm/json-parser.js';

const PENALTY_TO_DIMENSION: Record<string, string> = {
  logistics: 'logistics_efficiency',
  experience: 'experience_quality',
  food: 'food_score',
  realism: 'transit_realism',
  accommodation: 'accommodation_quality',
};

export function mapPenaltyToDimension(category: string): string {
  return PENALTY_TO_DIMENSION[category] || 'logistics_efficiency';
}

export async function runAdversarialCritic(
  provider: LLMProvider,
  planContent: string,
  activitiesDb: ActivitiesDB,
  rubrics: Rubrics,
): Promise<Penalty[]> {
  const prompt = buildCriticPrompt(planContent, activitiesDb, rubrics);

  try {
    const response = await provider.complete(prompt, 8000);
    const result = parseJsonResponse(response);
    if (Array.isArray(result)) return result;
    return [];
  } catch (e) {
    console.warn('WARNING: critic parse failed, returning empty penalties');
    return [];
  }
}

export function applyPenalties(
  scores: Record<string, DimensionResult>,
  penalties: Penalty[],
  maxPerDimension: number = -20,
): void {
  const penaltyByDim: Record<string, number> = {};

  for (const p of penalties) {
    const dim = mapPenaltyToDimension(p.category);
    penaltyByDim[dim] = penaltyByDim[dim] || 0;
    penaltyByDim[dim] = Math.max(penaltyByDim[dim] + p.penalty, maxPerDimension);
  }

  for (const [dim, pen] of Object.entries(penaltyByDim)) {
    if (dim in scores) {
      scores[dim].penalty = pen;
      scores[dim].score_before_penalty = scores[dim].score;
      scores[dim].score = Math.max(0, scores[dim].score + pen);
    }
  }
}

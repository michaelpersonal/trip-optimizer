import type { LLMProvider } from '../llm/provider.js';
import type { Adjustment, DimensionResult } from '../data/schemas.js';
import { buildHolisticPrompt } from './prompts.js';
import { parseJsonResponse } from '../llm/json-parser.js';

export async function runHolisticPass(
  provider: LLMProvider,
  allScores: Record<string, DimensionResult>,
): Promise<Adjustment[]> {
  const prompt = buildHolisticPrompt(allScores);

  try {
    const response = await provider.complete(prompt, 500);
    const result = parseJsonResponse(response);
    if (!Array.isArray(result)) return [];
    // Clamp adjustments to +/-5
    return result.filter((a: any) => Math.abs(a.adjustment || 0) <= 5);
  } catch (e) {
    console.warn('WARNING: holistic parse failed, returning no adjustments');
    return [];
  }
}

export function applyHolisticAdjustments(
  scores: Record<string, DimensionResult>,
  adjustments: Adjustment[],
): void {
  for (const adj of adjustments) {
    if (adj.dimension in scores) {
      scores[adj.dimension].holistic_adjustment = adj.adjustment;
      scores[adj.dimension].holistic_reason = adj.reason;
      scores[adj.dimension].score = Math.max(0, Math.min(100, scores[adj.dimension].score + adj.adjustment));
    }
  }
}

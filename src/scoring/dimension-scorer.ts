import type { LLMProvider } from '../llm/provider.js';
import type { Dimension, DimensionResult, SubDimensionScore } from '../data/schemas.js';
import { buildDimensionPrompt } from './prompts.js';
import { parseJsonResponse } from '../llm/json-parser.js';

export async function scoreDimension(
  provider: LLMProvider,
  dimName: string,
  dimConfig: Dimension,
  planContent: string,
): Promise<DimensionResult> {
  const prompt = buildDimensionPrompt(dimName, dimConfig, planContent);
  const response = await provider.complete(prompt, 800);
  const result = parseJsonResponse(response);

  const subDims = Object.keys(dimConfig.sub_dimensions);
  const subScores: Record<string, SubDimensionScore> = {};

  for (const sd of subDims) {
    if (sd in result) {
      const s = result[sd];
      subScores[sd] = {
        score: typeof s.score === 'number' ? s.score : 75,
        note: s.note || '',
      };
    } else {
      subScores[sd] = { score: 75, note: 'not scored' };
    }
  }

  const dimAvg = Object.values(subScores).reduce((sum, s) => sum + s.score, 0) / Object.values(subScores).length;

  return {
    score: Math.round(dimAvg * 10) / 10,
    weight: dimConfig.weight,
    sub_dimensions: subScores,
  };
}

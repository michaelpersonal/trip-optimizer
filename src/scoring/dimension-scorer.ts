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
  const subDimensions = dimConfig.sub_dimensions || {};
  const prompt = buildDimensionPrompt(dimName, { ...dimConfig, sub_dimensions: subDimensions }, planContent);
  const response = await provider.complete(prompt, 4000);
  let result: any;
  try {
    result = parseJsonResponse(response);
  } catch {
    result = null;
  }

  const subDims = Object.keys(subDimensions);
  const subScores: Record<string, SubDimensionScore> = {};

  if (subDims.length === 0) {
    // No sub-dimensions — try to extract an overall score from the result
    let score = 75;
    if (result && typeof result === 'object') {
      // Look for any numeric score in the response
      if (typeof result.overall?.score === 'number') {
        score = result.overall.score;
      } else {
        // Grab the first numeric score found
        for (const val of Object.values(result)) {
          if (val && typeof (val as any).score === 'number') {
            score = (val as any).score;
            break;
          }
        }
      }
    }
    subScores['overall'] = { score, note: 'single-dimension score' };
  } else {
    for (const sd of subDims) {
      if (result && typeof result === 'object' && sd in result) {
        const s = result[sd];
        subScores[sd] = {
          score: typeof s?.score === 'number' ? s.score : 75,
          note: s?.note || '',
        };
      } else {
        subScores[sd] = { score: 75, note: 'not scored' };
      }
    }
  }

  const scores = Object.values(subScores);
  const dimAvg = scores.length > 0
    ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
    : 75;

  return {
    score: Math.round(dimAvg * 10) / 10,
    weight: dimConfig.weight,
    sub_dimensions: subScores,
  };
}

import type { LLMProvider } from '../llm/provider.js';
import type {
  Rubrics, ActivitiesDB, TripConstraints,
  AbsoluteScoreResult, ComparativeScoreResult,
  DimensionResult,
} from '../data/schemas.js';
import { scoreDimension } from './dimension-scorer.js';
import { runAdversarialCritic, applyPenalties } from './critic.js';
import { runHolisticPass, applyHolisticAdjustments } from './holistic.js';
import { buildComparativePrompt } from './prompts.js';
import { parseJsonResponse } from '../llm/json-parser.js';

export class Scorer {
  constructor(
    private provider: LLMProvider,
    private model: string = 'unknown',
  ) {}

  async scoreAbsolute(
    planContent: string,
    activitiesDb: ActivitiesDB,
    constraints: TripConstraints,
    rubrics: Rubrics,
    log: (msg: string) => void = console.log,
  ): Promise<AbsoluteScoreResult> {
    const dimensions = rubrics.dimensions || {};
    const allScores: Record<string, DimensionResult> = {};

    // Pass 1: Score each dimension
    for (const [dimName, dimConfig] of Object.entries(dimensions)) {
      log(`  Scoring ${dimName}...`);
      const result = await scoreDimension(this.provider, dimName, dimConfig, planContent);
      allScores[dimName] = result;
      log(`  ${dimName}: ${result.score.toFixed(1)}`);
    }

    // Pass 2: Adversarial critic
    log('  Running adversarial critic...');
    const penalties = await runAdversarialCritic(this.provider, planContent, activitiesDb, rubrics);
    log(`  ${penalties.length} penalties found`);

    const maxPen = typeof rubrics.adversarial_penalties?.max_penalty_per_dimension === 'number'
      ? rubrics.adversarial_penalties.max_penalty_per_dimension
      : -20;
    applyPenalties(allScores, penalties, maxPen);

    // Pass 3: Holistic cross-dimension
    log('  Running holistic pass...');
    const adjustments = await runHolisticPass(this.provider, allScores);
    log(`  ${adjustments.length} adjustments`);
    applyHolisticAdjustments(allScores, adjustments);

    // Compute composite
    const composite = Object.values(allScores).reduce(
      (sum, d) => sum + d.weight * d.score,
      0,
    );

    return {
      mode: 'absolute',
      composite_score: Math.round(composite * 100) / 100,
      components: allScores,
      penalties,
      holistic_adjustments: adjustments,
      scored_at: new Date().toISOString(),
      model: this.model,
    };
  }

  async scoreComparative(
    oldPlanContent: string,
    newPlanContent: string,
    mutation: string,
    rubrics: Rubrics,
    log: (msg: string) => void = console.log,
  ): Promise<ComparativeScoreResult> {
    log('  Comparing plans...');
    const prompt = buildComparativePrompt(oldPlanContent, newPlanContent, mutation, rubrics);
    const response = await this.provider.complete(prompt, 4000);

    let deltas: Record<string, number> = {};
    try {
      const parsed = parseJsonResponse(response);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        deltas = parsed;
      }
    } catch {
      log('  WARNING: comparative parse failed, treating as neutral');
    }

    // Clamp deltas to +/-5
    const clamped: Record<string, number> = {};
    for (const [key, delta] of Object.entries(deltas)) {
      if (typeof delta === 'number') {
        clamped[key] = Math.max(-5, Math.min(5, delta));
      }
    }

    // Compute per-dimension impact
    const dimensions2 = rubrics.dimensions || {};
    const dimDeltas: Record<string, { delta: number; weight: number; affected_subs: Record<string, number> }> = {};

    for (const [dimName, dimConfig] of Object.entries(dimensions2)) {
      const subs = dimConfig.sub_dimensions || {};
      const subCount = Object.keys(subs).length || 1;
      let dimTotal = 0;
      const affectedSubs: Record<string, number> = {};

      for (const sdName of Object.keys(subs)) {
        const fullKey = `${dimName}.${sdName}`;
        const d = clamped[fullKey] || 0;
        dimTotal += d;
        if (d !== 0) affectedSubs[fullKey] = d;
      }

      dimDeltas[dimName] = {
        delta: Math.round((dimTotal / subCount) * 100) / 100,
        weight: dimConfig.weight,
        affected_subs: affectedSubs,
      };
    }

    // Composite delta
    const compositeDelta = Object.values(dimDeltas).reduce(
      (sum, d) => sum + d.weight * d.delta,
      0,
    );

    const nonZero = Object.entries(clamped).filter(([, v]) => v !== 0);
    const verdict = compositeDelta > 0.05 ? 'better' : compositeDelta < -0.05 ? 'worse' : 'neutral';
    log(`  ${verdict} (delta: ${compositeDelta >= 0 ? '+' : ''}${compositeDelta.toFixed(2)}, ${nonZero.length} subs affected)`);

    return {
      mode: 'comparative',
      verdict,
      composite_delta: Math.round(compositeDelta * 100) / 100,
      sub_dimension_deltas: clamped,
      dimension_deltas: dimDeltas,
      mutation,
      scored_at: new Date().toISOString(),
      model: this.model,
    };
  }
}

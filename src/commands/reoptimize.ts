import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import chalk from 'chalk';
import { resolveTrip } from '../data/registry.js';
import { createProvider } from '../llm/factory.js';
import { loadConfig } from '../data/config.js';
import { parseJsonResponse } from '../llm/json-parser.js';
import { writeProposal } from '../data/proposals.js';
import { Scorer } from '../scoring/scorer.js';
import { success, error, stderrLog, CLIError } from '../cli-utils/json-output.js';
import {
  createProposalId,
  createVersionId,
} from '../data/plan-schema.js';
import type {
  Plan,
  Proposal,
  IntentType,
  ProposalScope,
  ImpactSummary,
} from '../data/plan-schema.js';
import type { ActivitiesDB, TripConstraints, Rubrics } from '../data/schemas.js';

interface ReoptimizeOptions {
  trip?: string;
  scope: string;
  goal: string;
  lang?: string;
  json?: boolean;
  _registryDir?: string;
}

export function parseScope(scope: string): ProposalScope {
  const result: ProposalScope = {};
  const match = scope.match(/^(\w+):(.+)$/);
  if (!match) return result;

  const [, key, value] = match;
  switch (key) {
    case 'day':
      result.day_index = parseInt(value, 10);
      break;
    case 'period':
      result.period = value as ProposalScope['period'];
      break;
    case 'segment':
      result.segment_id = value;
      break;
    // city: filtering happens in the prompt, no structured scope field
    case 'city':
      break;
  }
  return result;
}

function bumpVersion(versionId: string): string {
  const match = versionId.match(/v_(\d+)/);
  if (!match) return createVersionId(1);
  return createVersionId(parseInt(match[1], 10) + 1);
}

function buildReoptimizePrompt(
  plan: Plan,
  constraints: TripConstraints | null,
  activitiesDb: ActivitiesDB | null,
  scope: string,
  goal: string,
  lang: string,
): string {
  const langInstruction =
    lang === 'zh'
      ? 'Provide explanations in both English and Chinese (中文). Use key "en" and "zh" in the explanation object.'
      : 'Provide explanations in English. Use key "en" in the explanation object.';

  const constraintsBlock = constraints
    ? `\nTrip constraints:\n${yaml.dump(constraints)}`
    : '';

  const activitiesBlock = activitiesDb
    ? `\nActivities database:\n${JSON.stringify(activitiesDb, null, 2)}`
    : '';

  return `You are a travel plan optimizer. You need to re-optimize part of a trip plan within a specific scope toward a specific goal.

Your job:
1. Only modify segments within the specified scope — keep everything else unchanged
2. Optimize the segments within scope toward the stated goal
3. Preserve segment IDs for unchanged segments
4. Generate new segment IDs (format: seg_<random>) for new or replaced segments
5. Maintain time consistency (no overlapping segments)
6. Respect constraints if provided

Scope: ${scope}
Goal: ${goal}

${langInstruction}

Respond with a JSON object:
{
  "status": "ok",
  "intent": "scoped_reoptimize",
  "scope": { "day_index": <number|null>, "segment_id": "<string|null>", "period": "<string|null>" },
  "candidate_plan": <full modified Plan JSON>,
  "tradeoffs": ["<tradeoff 1>", "<tradeoff 2>"],
  "explanation": { "en": "<explanation of changes and tradeoffs>" }
}

Current plan:
${JSON.stringify(plan, null, 2)}
${constraintsBlock}
${activitiesBlock}`;
}

export async function reoptimizeAction(options: ReoptimizeOptions): Promise<void> {
  const lang = options.lang ?? 'en';

  // 1. Resolve trip
  let tripId: string | null;
  let tripDir: string;
  try {
    const resolved = resolveTrip(options.trip, undefined, options._registryDir);
    tripId = resolved.tripId;
    tripDir = resolved.tripDir;
  } catch (e) {
    if (e instanceof CLIError) {
      if (options.json) {
        error('reoptimize', e.code);
        return;
      }
      process.stderr.write(`Error: ${e.message}\n`);
      if (e.hint) process.stderr.write(`Hint: ${e.hint}\n`);
      return;
    }
    throw e;
  }

  // 2. Read plan.json
  const planPath = path.join(tripDir, 'plan.json');
  if (!fs.existsSync(planPath)) {
    if (options.json) {
      error('reoptimize', 'NO_PLAN', tripId ?? undefined);
      return;
    }
    process.stderr.write('Error: Trip has no plan.json\n');
    return;
  }

  const plan: Plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));

  // 3. Load trip context (all optional)
  let constraints: TripConstraints | null = null;
  let rubrics: Rubrics | null = null;
  let activitiesDb: ActivitiesDB | null = null;

  const constraintsPath = path.join(tripDir, 'constraints.yaml');
  if (fs.existsSync(constraintsPath)) {
    try {
      constraints = yaml.load(fs.readFileSync(constraintsPath, 'utf-8')) as TripConstraints;
    } catch { /* ignore parse errors */ }
  }

  const rubricsPath = path.join(tripDir, 'rubrics.yaml');
  if (fs.existsSync(rubricsPath)) {
    try {
      rubrics = yaml.load(fs.readFileSync(rubricsPath, 'utf-8')) as Rubrics;
    } catch { /* ignore parse errors */ }
  }

  const activitiesPath = path.join(tripDir, 'activities_db.json');
  if (fs.existsSync(activitiesPath)) {
    try {
      activitiesDb = JSON.parse(fs.readFileSync(activitiesPath, 'utf-8')) as ActivitiesDB;
    } catch { /* ignore parse errors */ }
  }

  // 4. Build prompt and call LLM
  const prompt = buildReoptimizePrompt(plan, constraints, activitiesDb, options.scope, options.goal, lang);

  let rawResponse: string;
  const config = loadConfig();
  const provider = createProvider(config);

  try {
    stderrLog('Optimizing within scope...');
    rawResponse = await provider.complete(prompt, 32000);
  } catch (e) {
    if (options.json) {
      error('reoptimize', 'LLM_ERROR', tripId ?? undefined);
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Error: Model call failed — ${msg}\n`);
    return;
  }

  // 5. Parse response
  let parsed: any;
  try {
    parsed = parseJsonResponse(rawResponse);
  } catch (e) {
    if (options.json) {
      error('reoptimize', 'LLM_ERROR', tripId ?? undefined);
      return;
    }
    process.stderr.write('Error: Could not parse LLM response\n');
    return;
  }

  const proposalId = createProposalId(options.goal);
  const intent: IntentType = 'scoped_reoptimize';
  const scope: ProposalScope = parsed.scope ?? parseScope(options.scope);
  const explanation: Record<string, string> = parsed.explanation ?? {};

  // 6. Candidate plan — bump version
  const candidatePlan: Plan = parsed.candidate_plan ?? plan;
  candidatePlan.version_id = bumpVersion(plan.version_id);
  candidatePlan.parent_version_id = plan.version_id;
  candidatePlan.created_at = new Date().toISOString();
  candidatePlan.created_by = 'reoptimize';

  // 7. Optionally score (non-fatal)
  let impactSummary: ImpactSummary | null = null;
  if (rubrics && constraints && activitiesDb) {
    try {
      stderrLog('Scoring candidate plan...');
      const scorer = new Scorer(provider);
      const comparative = await scorer.scoreComparative(
        JSON.stringify(plan, null, 2),
        JSON.stringify(candidatePlan, null, 2),
        `reoptimize scope=${options.scope} goal=${options.goal}`,
        rubrics,
        stderrLog,
      );

      const changedSegments: string[] = [];
      if (parsed.scope?.segment_id) {
        changedSegments.push(parsed.scope.segment_id);
      }

      impactSummary = {
        changed_segments: changedSegments,
        score_before: plan.score?.composite ?? 0,
        score_after: (plan.score?.composite ?? 0) + comparative.composite_delta,
        score_delta: comparative.composite_delta,
        tradeoffs: parsed.tradeoffs ?? [],
      };
    } catch (e) {
      stderrLog(`Warning: scoring failed — ${e instanceof Error ? e.message : String(e)}`);
      impactSummary = null;
    }
  }

  // If we have tradeoffs but no score, still populate impact summary
  if (!impactSummary && parsed.tradeoffs?.length) {
    impactSummary = {
      changed_segments: parsed.scope?.segment_id ? [parsed.scope.segment_id] : [],
      score_before: plan.score?.composite ?? 0,
      score_after: plan.score?.composite ?? 0,
      score_delta: 0,
      tradeoffs: parsed.tradeoffs,
    };
  }

  // 8. Build and write proposal
  const proposal: Proposal = {
    proposal_id: proposalId,
    trip_id: tripId ?? '',
    base_version_id: plan.version_id,
    status: 'pending',
    requested_by: 'user',
    requested_at: new Date().toISOString(),
    request_language: lang,
    raw_request: `reoptimize scope=${options.scope} goal=${options.goal}`,
    intent,
    scope,
    candidate_plan: candidatePlan,
    impact_summary: impactSummary,
    explanation,
  };

  writeProposal(tripDir, proposal);

  // 9. Output
  if (options.json) {
    success('reoptimize', tripId, proposal);
  } else {
    console.log(chalk.green(`\n  Reoptimize proposal created: ${proposalId}`));
    console.log(`  Scope: ${options.scope}`);
    console.log(`  Goal: ${options.goal}`);
    console.log(`  New version: ${candidatePlan.version_id}`);
    if (impactSummary) {
      const delta = impactSummary.score_delta;
      console.log(`  Score delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`);
      if (impactSummary.tradeoffs.length > 0) {
        console.log('  Tradeoffs:');
        for (const t of impactSummary.tradeoffs) {
          console.log(`    - ${t}`);
        }
      }
    }
    if (explanation.en) {
      console.log(`\n  ${explanation.en}`);
    }
    if (explanation.zh) {
      console.log(`  ${explanation.zh}`);
    }
    console.log();
  }
}

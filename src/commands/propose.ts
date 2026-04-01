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

interface ProposeOptions {
  trip?: string;
  request: string;
  requestedBy?: string;
  lang?: string;
  json?: boolean;
}

function bumpVersion(versionId: string): string {
  const match = versionId.match(/v_(\d+)/);
  if (!match) return createVersionId(1);
  return createVersionId(parseInt(match[1], 10) + 1);
}

function buildPrompt(
  plan: Plan,
  constraints: TripConstraints | null,
  activitiesDb: ActivitiesDB | null,
  request: string,
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

  return `You are a travel plan optimizer. A user wants to change their trip plan.

Your job:
1. Classify the user's intent as one of: "direct_override", "scoped_reoptimize", or "structural_change"
   - direct_override: simple swap or replacement (e.g. "change lunch to Pizza Hut")
   - scoped_reoptimize: re-optimize a portion (e.g. "make day 3 more relaxed")
   - structural_change: changes affecting multiple days or the overall structure (e.g. "add an extra day in Tokyo")
2. Identify the scope: which day(s), segment(s), or period(s) are affected
3. If the request is ambiguous (e.g. references something that could match multiple segments), return a needs_clarification response
4. Otherwise, generate a modified plan with the change applied

${langInstruction}

Rules:
- Preserve segment IDs for unchanged segments
- Generate new segment IDs (format: seg_<random>) for new segments
- Maintain time consistency (no overlapping segments)
- Respect constraints if provided
- Include tradeoffs in the explanation

Respond with a JSON object in ONE of these two formats:

Format A — needs_clarification:
{
  "status": "needs_clarification",
  "intent": "<intent_type>",
  "scope": { "day_index": <number|null>, "segment_id": "<string|null>", "period": "<string|null>" },
  "clarification": {
    "question": "<question to ask the user>",
    "options": [
      { "day_index": <number>, "segment_id": "<id>", "title": "<description>" }
    ]
  },
  "explanation": { "en": "<explanation>" }
}

Format B — candidate plan:
{
  "status": "ok",
  "intent": "<intent_type>",
  "scope": { "day_index": <number|null>, "segment_id": "<string|null>", "period": "<string|null>" },
  "candidate_plan": <full modified Plan JSON>,
  "tradeoffs": ["<tradeoff 1>", "<tradeoff 2>"],
  "explanation": { "en": "<explanation>" }
}

Current plan:
${JSON.stringify(plan, null, 2)}
${constraintsBlock}
${activitiesBlock}

User request: ${request}`;
}

export async function proposeAction(options: ProposeOptions): Promise<void> {
  const lang = options.lang ?? 'en';

  // 1. Resolve trip
  let tripId: string | null;
  let tripDir: string;
  try {
    const resolved = resolveTrip(options.trip);
    tripId = resolved.tripId;
    tripDir = resolved.tripDir;
  } catch (e) {
    if (e instanceof CLIError) {
      if (options.json) {
        error('propose', e.code);
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
      error('propose', 'NO_PLAN', tripId ?? undefined);
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
  const prompt = buildPrompt(plan, constraints, activitiesDb, options.request, lang);

  let rawResponse: string;
  const config = loadConfig();
  const provider = createProvider(config);

  try {
    stderrLog('Analyzing request...');
    rawResponse = await provider.complete(prompt, 32000);
  } catch (e) {
    if (options.json) {
      error('propose', 'LLM_ERROR', tripId ?? undefined);
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
      error('propose', 'LLM_ERROR', tripId ?? undefined);
      return;
    }
    process.stderr.write('Error: Could not parse LLM response\n');
    return;
  }

  const proposalId = createProposalId(options.request);
  const intent: IntentType = parsed.intent ?? 'scoped_reoptimize';
  const scope: ProposalScope = parsed.scope ?? {};
  const explanation: Record<string, string> = parsed.explanation ?? {};

  // 6. Handle needs_clarification
  if (parsed.status === 'needs_clarification') {
    const proposal: Proposal = {
      proposal_id: proposalId,
      trip_id: tripId ?? '',
      base_version_id: plan.version_id,
      status: 'needs_clarification',
      requested_by: options.requestedBy ?? 'user',
      requested_at: new Date().toISOString(),
      request_language: lang,
      raw_request: options.request,
      intent,
      scope,
      candidate_plan: null,
      impact_summary: null,
      explanation,
      clarification: parsed.clarification,
    };

    writeProposal(tripDir, proposal);

    if (options.json) {
      success('propose', tripId, proposal);
    } else {
      console.log(chalk.yellow(`\n  Clarification needed: ${parsed.clarification?.question ?? 'Ambiguous request'}`));
      if (parsed.clarification?.options) {
        for (const opt of parsed.clarification.options) {
          console.log(`    - Day ${opt.day_index}: ${opt.title} (${opt.segment_id})`);
        }
      }
      console.log(`\n  Proposal ID: ${proposalId}\n`);
    }
    return;
  }

  // 7. Candidate plan — bump version
  const candidatePlan: Plan = parsed.candidate_plan ?? plan;
  candidatePlan.version_id = bumpVersion(plan.version_id);
  candidatePlan.parent_version_id = plan.version_id;
  candidatePlan.created_at = new Date().toISOString();
  candidatePlan.created_by = 'propose';

  // 8. Optionally score (non-fatal)
  let impactSummary: ImpactSummary | null = null;
  if (rubrics && constraints && activitiesDb) {
    try {
      stderrLog('Scoring candidate plan...');
      const scorer = new Scorer(provider);
      const comparative = await scorer.scoreComparative(
        JSON.stringify(plan, null, 2),
        JSON.stringify(candidatePlan, null, 2),
        options.request,
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
      // Non-fatal: proceed without score
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

  // 9. Build and write proposal
  const proposal: Proposal = {
    proposal_id: proposalId,
    trip_id: tripId ?? '',
    base_version_id: plan.version_id,
    status: 'pending',
    requested_by: options.requestedBy ?? 'user',
    requested_at: new Date().toISOString(),
    request_language: lang,
    raw_request: options.request,
    intent,
    scope,
    candidate_plan: candidatePlan,
    impact_summary: impactSummary,
    explanation,
  };

  writeProposal(tripDir, proposal);

  // 10. Output
  if (options.json) {
    success('propose', tripId, proposal);
  } else {
    console.log(chalk.green(`\n  Proposal created: ${proposalId}`));
    console.log(`  Intent: ${intent}`);
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

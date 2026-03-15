import type { Dimension, Rubrics, ActivitiesDB } from '../data/schemas.js';

export function buildRubricText(dimConfig: Dimension): string {
  const lines: string[] = [];
  for (const [subName, subConfig] of Object.entries(dimConfig.sub_dimensions)) {
    lines.push(`\n### ${subName}: ${subConfig.description}`);
    const sortedAnchors = Object.entries(subConfig.anchors)
      .sort(([a], [b]) => Number(a) - Number(b));
    for (const [score, desc] of sortedAnchors) {
      lines.push(`  ${score}: ${desc}`);
    }
  }
  return lines.join('\n');
}

export function buildDimensionPrompt(
  dimName: string,
  dimConfig: Dimension,
  planContent: string,
): string {
  const rubricText = buildRubricText(dimConfig);
  const subDims = Object.keys(dimConfig.sub_dimensions);

  return `Score this travel plan on the dimension: ${dimName}

Score each sub-dimension on a 0-100 scale using the rubric anchors below.
Do NOT round to multiples of 5 — use precise scores like 83, 87, 91.

## Rubric Anchors
${rubricText}

## Travel Plan
${planContent}

Respond in this exact JSON format (no other text):
{
${subDims.map(sd => `  "${sd}": {"score": <0-100>, "note": "<1 sentence>"}`).join(',\n')}
}`;
}

export function buildCriticPrompt(
  planContent: string,
  activitiesDb: ActivitiesDB,
  rubrics: Rubrics,
): string {
  // Build penalty rules text
  const rulesText: string[] = [];
  for (const [category, rules] of Object.entries(rubrics.adversarial_penalties)) {
    if (category === 'max_penalty_per_dimension') continue;
    if (!Array.isArray(rules)) continue;
    for (const r of rules) {
      rulesText.push(`- [${category.toUpperCase()}] ${r.rule} (penalty: ${r.penalty})`);
    }
  }

  // Build tourist traps list
  const traps: string[] = [];
  for (const [city, data] of Object.entries(activitiesDb)) {
    for (const t of data.tourist_traps || []) {
      traps.push(`- ${city}: ${t.name}`);
    }
  }

  return `You are a travel plan critic. Your ONLY job is to find flaws.
Do NOT praise anything. Apply these specific penalty rules:

${rulesText.join('\n')}

## Known Tourist Traps (from research database)
${traps.length > 0 ? traps.join('\n') : '(none researched yet)'}

## The Plan
${planContent}

Find every violation of the rules above. Be strict and specific.
For each issue, cite the exact day number and the specific problem.

Return a JSON array of penalties (no other text):
[{"category": "logistics|experience|food|realism", "day": N, "issue": "specific description", "penalty": -N}]

Return an empty array [] if genuinely no issues found.`;
}

export function buildHolisticPrompt(
  allScores: Record<string, { score: number; weight: number; sub_dimensions: Record<string, { score: number }> }>,
): string {
  const scoresSummary: string[] = [];
  for (const [dim, data] of Object.entries(allScores)) {
    const subDetail = Object.entries(data.sub_dimensions)
      .map(([sd, info]) => `${sd}: ${info.score.toFixed(0)}`)
      .join(', ');
    scoresSummary.push(`- ${dim}: ${data.score.toFixed(1)} (weight: ${data.weight}) [${subDetail}]`);
  }

  return `You are reviewing scores from independent judges evaluating a travel plan.
Each judge scored one dimension without seeing the others' results.

Your job: identify where dimensions INTERACT and one judge missed something
that another judge's context reveals. Adjust +/-5 points max per dimension.

## Current Scores
${scoresSummary.join('\n')}

Examples of cross-dimension interactions:
- Food scored high but logistics shows 10hr transit day — station food is smart, bump food +2
- Experience scored high but accommodation is far from activities — experience -3
- Budget scored well but didn't notice cheaper hotel options available — budget -2

Return a JSON array of adjustments (no other text):
[{"dimension": "dim_name", "adjustment": +/-N, "reason": "1 sentence"}]

Max +/-5 per dimension. Return [] if no adjustments needed.`;
}

export function buildComparativePrompt(
  oldPlanContent: string,
  newPlanContent: string,
  mutation: string,
  rubrics: Rubrics,
): string {
  const allSubDims: string[] = [];
  for (const [dimName, dimConfig] of Object.entries(rubrics.dimensions)) {
    for (const sdName of Object.keys(dimConfig.sub_dimensions)) {
      allSubDims.push(`${dimName}.${sdName}`);
    }
  }

  return `You are comparing two versions of a travel plan. A single mutation was applied.

## Mutation Applied
${mutation}

## PLAN A (before mutation)
${oldPlanContent}

## PLAN B (after mutation)
${newPlanContent}

For each sub-dimension below, score the IMPACT of this mutation:
- Positive (+1 to +5): the mutation improved this aspect
- Negative (-1 to -5): the mutation hurt this aspect
- Neutral (0): no meaningful change

IMPORTANT: Most sub-dimensions should be NEUTRAL (0) — a single mutation
rarely affects more than 2-3 sub-dimensions. Don't inflate changes.

Sub-dimensions:
${allSubDims.map(sd => `- ${sd}`).join('\n')}

Return a JSON object with ONLY affected sub-dimensions (non-zero deltas).
Omit neutral sub-dimensions.

Example (no other text):
{"logistics_efficiency.transit_realism": 3, "experience_quality.authenticity": -1}

Return {} if no meaningful impact.`;
}

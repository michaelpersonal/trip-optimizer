import type { LLMProvider } from '../llm/provider.js';
import type { MutationType, MutationResult, TripConstraints, ActivitiesDB } from '../data/schemas.js';

const MUTATION_ROTATION: MutationType[] = ['SWAP', 'UPGRADE', 'REORDER', 'SIMPLIFY', 'REALLOCATE'];

export function pickMutationType(iteration: number, consecutiveDiscards: number): MutationType {
  if (consecutiveDiscards >= 5) return 'RESEARCH';
  return MUTATION_ROTATION[iteration % MUTATION_ROTATION.length];
}

function buildMutationPrompt(
  type: MutationType,
  planContent: string,
  constraints: TripConstraints,
  activitiesDb: ActivitiesDB,
  lastScoreNotes?: string,
): string {
  const cityList = constraints.cities.map(c => `${c.name} (${c.min_days}-${c.max_days} days)`).join(', ');
  const dbSummary = Object.entries(activitiesDb)
    .map(([city, data]) => `${city}: ${data.activities?.length || 0} activities, ${data.restaurants?.length || 0} restaurants`)
    .join('\n');

  const baseContext = `## Current Plan
${planContent}

## Constraints
Cities: ${cityList}
Preferences: ${constraints.preferences.priority_order.join(', ')}
Anti-patterns: ${constraints.preferences.anti_patterns.join(', ')}
${constraints.dietary.length > 0 ? `Dietary: ${constraints.dietary.join(', ')}` : ''}

## Activities Database Summary
${dbSummary || '(empty — no research done yet)'}
${lastScoreNotes ? `\n## Last Score Notes\n${lastScoreNotes}` : ''}`;

  const typePrompts: Record<MutationType, string> = {
    SWAP: `Find the lowest-quality or most generic activity in the plan and replace it with a better alternative. Prefer activities that match the traveler's vibe preferences and are unique to the specific city. If the activities database has scored alternatives, use the highest-scored one.`,
    UPGRADE: `Find a generic or mediocre restaurant recommendation in the plan and replace it with a more authentic, local-favorite option. Prefer specific named restaurants over generic descriptions. The replacement should serve regional cuisine and be the kind of place locals actually eat at.`,
    REORDER: `Find the day with the worst geographic clustering (activities that zigzag across the city) and reorder them so they flow geographically. Morning activities should be near each other, with a natural arc through the day.`,
    SIMPLIFY: `Find the most packed day or the weakest activity in the plan and remove it, replacing it with free wandering time in a good neighborhood. Unstructured time for exploring is valuable — don't feel every hour needs an activity.`,
    REALLOCATE: `Look at the day allocation across cities. Find a city that feels rushed (too many highlights, too few days) and one that feels slow (padding activities, not enough to do). Move one day from the slow city to the rushed one. Respect min/max day bounds.`,
    RESEARCH: `Identify the city with the weakest activities or fewest database entries. Generate 5-8 new activity and restaurant recommendations for that city. Focus on hidden gems, local favorites, seasonal specialties, and neighborhoods for wandering. Add them to the activities database, then pick the best one and swap it into the plan.`,
  };

  return `You are making a single "${type}" mutation to improve this travel plan.

## Task
${typePrompts[type]}

${baseContext}

## Response Format
Return a JSON object with exactly these fields:
{
  "type": "${type}",
  "description": "Brief description of what changed (e.g., 'Day 3: replaced Temple X with Yanaka neighborhood walk')",
  "new_plan": "The COMPLETE updated plan.md content with the mutation applied"${type === 'RESEARCH' ? ',\n  "new_activities": "JSON string of new activities to add to the database"' : ''}
}

IMPORTANT:
- Make exactly ONE change. Do not modify anything else in the plan.
- Return the COMPLETE plan content, not just the changed section.
- Keep all YAML frontmatter intact.
- The description should be specific enough to understand without reading the full plan.`;
}

export async function generateMutation(
  provider: LLMProvider,
  type: MutationType,
  planContent: string,
  constraints: TripConstraints,
  activitiesDb: ActivitiesDB,
  lastScoreNotes?: string,
): Promise<MutationResult> {
  const prompt = buildMutationPrompt(type, planContent, constraints, activitiesDb, lastScoreNotes);
  const response = await provider.complete(prompt, 10000);

  // Parse the response — try JSON first, fall back to extracting fields
  let parsed: any;
  try {
    // Strip markdown code blocks if present
    let text = response;
    if (text.startsWith('```')) {
      text = text.split('\n').slice(1).join('\n');
      const lastBacktick = text.lastIndexOf('```');
      if (lastBacktick >= 0) text = text.substring(0, lastBacktick).trim();
    }
    parsed = JSON.parse(text);
  } catch {
    // Try to extract JSON from the response
    const start = response.indexOf('{');
    const end = response.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(response.substring(start, end + 1));
      } catch {
        throw new Error('Failed to parse mutation response as JSON');
      }
    } else {
      throw new Error('No JSON found in mutation response');
    }
  }

  return {
    type: parsed.type || type,
    description: parsed.description || 'Unknown mutation',
    newPlanContent: parsed.new_plan || planContent,
  };
}

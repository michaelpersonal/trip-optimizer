import type { LLMProvider } from '../llm/provider.js';
import type { TripConstraints } from '../data/schemas.js';
import { getLlmLanguageInstruction } from '../i18n.js';

// Seed rubric example (condensed from the China trip)
const SEED_RUBRIC = `dimensions:
  experience_quality:
    weight: 0.25
    sub_dimensions:
      authenticity:
        description: "Are activities local-oriented vs tourist-oriented?"
        anchors:
          60: "Multiple tourist traps in the plan"
          80: "Mostly local-oriented, 1-2 tourist items remain"
          90: "Every activity feels like a local showed you their city"
      uniqueness:
        description: "'Can only do this HERE' experiences"
        anchors:
          60: "Activities could be done in any major city"
          80: "Each city has 1-2 'only here' experiences"
          90: "Nearly every activity leverages something unique to this place"
  logistics_efficiency:
    weight: 0.20
    sub_dimensions:
      geographic_clustering:
        description: "Activities within each day don't zigzag across the city"
        anchors:
          60: "Multiple days have morning-east, lunch-north, afternoon-south"
          80: "Most days are geographically logical"
          90: "Days are designed as geographic arcs"
      transit_realism:
        description: "Specific times, realistic buffers"
        anchors:
          60: "Vague transit like 'fly to X' with no details"
          80: "Most transit has times, some connections lack buffers"
          90: "Door-to-door timing with buffers for every connection"
  food_score:
    weight: 0.15
    sub_dimensions:
      regional_authenticity:
        description: "Local specialties vs generic restaurants"
        anchors:
          60: "Hotel buffets and chains for most meals"
          80: "Mostly local specialties, specific restaurants named"
          90: "Restaurants are the ones locals queue for"
  time_allocation:
    weight: 0.15
    sub_dimensions:
      pacing:
        description: "Not too rushed, not too empty"
        anchors:
          60: "Some days have 6 activities, others nothing"
          80: "Generally steady, a few days overpacked"
          90: "Natural rhythm — active mornings, relaxed afternoons"
  budget_efficiency:
    weight: 0.10
    sub_dimensions:
      value_ratio:
        description: "High-quality experiences at reasonable cost"
        anchors:
          60: "Expensive activities with low enjoyment"
          80: "Good balance, expensive items justified"
          90: "Maximizes experience per dollar"
  accommodation_quality:
    weight: 0.10
    sub_dimensions:
      location_fit:
        description: "Hotels near the day's key activities"
        anchors:
          60: "Hotels in random locations requiring long commutes"
          80: "Most hotels well-located"
          90: "Hotel locations chosen WITH the itinerary in mind"
  transit_realism:
    weight: 0.05
    sub_dimensions:
      specificity:
        description: "Flight numbers, train types, departure times stated"
        anchors:
          60: "Just 'fly to X' with no details"
          80: "Most transit has times, some still vague"
          90: "Could book every ticket from this plan"

adversarial_penalties:
  logistics:
    - rule: "Transit without specific departure/arrival times"
      penalty: -3
    - rule: "Activities scheduled during transit time"
      penalty: -10
  experience:
    - rule: "Tourist trap still in plan"
      penalty: -8
    - rule: "Day with zero unstructured time"
      penalty: -5
  food:
    - rule: "Generic 'local restaurant' without specific recommendation"
      penalty: -3
    - rule: "Chain restaurant when local alternative exists"
      penalty: -5
  realism:
    - rule: "More than 4 major activities in a single day"
      penalty: -5
  max_penalty_per_dimension: -20`;

export async function generateRubrics(
  provider: LLMProvider,
  constraints: TripConstraints,
  learnedSignals?: string,
): Promise<string> {
  const tripSummary = `Trip: ${constraints.trip.name}
Duration: ${constraints.trip.total_days} days
Travelers: ${constraints.trip.travelers}
Cities: ${constraints.cities.map(c => c.name).join(' → ')}
Budget: ${constraints.budget.currency} ${constraints.budget.total}
Vibes: ${constraints.preferences.priority_order.join(', ')}
Anti-patterns: ${constraints.preferences.anti_patterns.join(', ')}
Dietary: ${constraints.dietary.length > 0 ? constraints.dietary.join(', ') : 'none'}
Loyalty program: ${constraints.loyalty_program || 'none'}
${constraints.must_visit?.length > 0 ? `Must-visit: ${constraints.must_visit.join(', ')}` : ''}
${constraints.hard_constraints?.length > 0 ? `Constraints: ${constraints.hard_constraints.join('. ')}` : ''}
${constraints.user_notes ? `User notes: ${constraints.user_notes}` : ''}`;

  const learnedSection = learnedSignals
    ? `\n## Learned Preferences from Past Trips\n${learnedSignals}\n`
    : '';

  const prompt = `Generate a scoring rubric for evaluating this travel plan. The rubric should have 5-7 scoring dimensions, each with 2-4 sub-dimensions. Each sub-dimension needs anchor descriptions at scores 60, 80, and 90.

Also generate adversarial penalty rules that catch specific flaws.

## Trip Details
${tripSummary}
${learnedSection}

## Seed Example (adapt dimensions and anchors to fit THIS specific trip)
\`\`\`yaml
${SEED_RUBRIC}
\`\`\`

IMPORTANT:
- Adapt dimensions to this trip type (e.g., a solo backpacking trip might have "social_opportunities", a family trip might have "kid_friendliness")
- Dimension weights must sum to 1.0
- Anchor descriptions should reference specifics of this trip (cities, season, budget level)
- Keep the same YAML structure as the seed example
- Return ONLY valid YAML, no other text${getLlmLanguageInstruction()}`;

  const response = await provider.complete(prompt, 4000);

  // Strip markdown code blocks if present
  let yamlText = response;
  if (yamlText.startsWith('```')) {
    yamlText = yamlText.split('\n').slice(1).join('\n');
    const lastBacktick = yamlText.lastIndexOf('```');
    if (lastBacktick >= 0) {
      yamlText = yamlText.substring(0, lastBacktick).trim();
    }
  }

  return yamlText;
}

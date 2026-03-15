import type { LLMProvider } from '../llm/provider.js';
import type { TripConstraints } from '../data/schemas.js';

export async function generatePlan(
  provider: LLMProvider,
  constraints: TripConstraints,
): Promise<string> {
  const prompt = `Generate a detailed day-by-day travel itinerary for this trip.

## Trip Details
Name: ${constraints.trip.name}
Dates: ${constraints.trip.start_date} to ${constraints.trip.end_date} (${constraints.trip.total_days} days)
Travelers: ${constraints.trip.travelers}
Origin: ${constraints.trip.origin}
Cities (in order): ${constraints.cities.map(c => `${c.name} (${c.min_days}-${c.max_days} days)`).join(' → ')}
Budget: ${constraints.budget.currency} ${constraints.budget.total} total
Preferences: ${constraints.preferences.priority_order.join(', ')}
Anti-patterns to avoid: ${constraints.preferences.anti_patterns.join(', ')}
Dietary: ${constraints.dietary.length > 0 ? constraints.dietary.join(', ') : 'none'}
Hotel loyalty: ${constraints.loyalty_program || 'none'}

## Requirements
- Start with YAML frontmatter containing trip metadata
- Each day should have: morning activity, lunch, afternoon activity, dinner, evening
- Include specific restaurant recommendations (not generic "local restaurant")
- Include transit details between cities (transport mode, approximate time)
- Include hotel recommendations
- Leave some unstructured time for wandering
- Be realistic about pacing — travel days should be light on activities

## Format
---
trip_name: "${constraints.trip.name}"
total_days: ${constraints.trip.total_days}
start_date: ${constraints.trip.start_date}
end_date: ${constraints.trip.end_date}
---

# Day 1: [City] — [Theme]
## Morning
...
## Lunch
...
## Afternoon
...
## Dinner
...
## Evening
...

**Hotel:** [Name]
**Transit:** [if applicable]

Generate the complete itinerary now.`;

  return await provider.complete(prompt, 8000);
}

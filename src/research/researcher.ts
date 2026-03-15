import type { LLMProvider } from '../llm/provider.js';
import type { CityResearch, TripConstraints } from '../data/schemas.js';
import { parseJsonResponse } from '../llm/json-parser.js';

export async function researchCity(
  provider: LLMProvider,
  cityKey: string,
  cityName: string,
  constraints: TripConstraints,
  existingCount: number = 0,
): Promise<CityResearch> {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const monthIndex = parseInt(constraints.trip.start_date.substring(5, 7), 10) - 1;
  const monthName = monthNames[monthIndex] || 'this season';

  const prompt = `You are a travel researcher. Generate detailed recommendations for ${cityName}.

## Trip Context
Dates: ${constraints.trip.start_date} to ${constraints.trip.end_date}
Travelers: ${constraints.trip.travelers}
Preferences: ${constraints.preferences.priority_order.join(', ')}
Anti-patterns: ${constraints.preferences.anti_patterns.join(', ')}
${constraints.dietary.length > 0 ? `Dietary: ${constraints.dietary.join(', ')}` : ''}
Budget level: ${constraints.budget.currency} ${constraints.budget.total} total for ${constraints.trip.total_days} days

## What to Research
Generate authentic, local-oriented recommendations:

1. **Activities** (6-8): Hidden gems, unique experiences, seasonal specialties, neighborhoods for wandering. Score each 1-10 on authenticity and uniqueness. NO tourist traps.

2. **Restaurants** (5-7): Local favorites, street food spots, regional specialty restaurants. The kind of place with plastic tables that locals queue for. Score each 1-10.

3. **Neighborhoods for wandering** (3-4): Walkable areas with character, local vibe, no chain stores.

4. **Tourist traps** (2-4): Overrated, overcrowded places to AVOID with reasons why.

5. **Seasonal highlights**: What's special about visiting ${cityName} during ${monthName}.

Return a JSON object matching this exact structure:
{
  "activities": [
    {
      "name": "Activity name",
      "name_local": "Local language name or empty string",
      "type": "vibe|food|culture|nature|adventure|history",
      "score": 8,
      "authenticity": 9,
      "uniqueness": 7,
      "notes": "Why this is great",
      "crowd_level": "low|medium|high",
      "cost_per_person": 0,
      "currency": "USD",
      "duration_hours": 2,
      "location": "Neighborhood or area",
      "best_time": "morning|afternoon|evening|any",
      "seasonal": null,
      "source": "llm_knowledge"
    }
  ],
  "restaurants": [
    {
      "name": "Restaurant name",
      "name_local": "",
      "cuisine": "Regional cuisine type",
      "score": 9,
      "authenticity": 9,
      "notes": "Why locals love this place",
      "cost_per_person": 15,
      "currency": "USD",
      "location": "Area",
      "reservation_needed": false,
      "source": "llm_knowledge"
    }
  ],
  "neighborhoods_for_wandering": [
    {
      "name": "Neighborhood name",
      "vibe_score": 8,
      "walkability": "excellent|good|moderate",
      "notes": "What makes this area great for wandering"
    }
  ],
  "tourist_traps": [
    {
      "name": "Overrated place",
      "reason": "Why to skip it"
    }
  ],
  "seasonal_highlights": [
    "What's special this time of year"
  ]
}

Return ONLY the JSON object, no other text.`;

  const response = await provider.complete(prompt, 4000);
  const parsed = parseJsonResponse(response);

  // Ensure all arrays exist
  return {
    activities: parsed.activities || [],
    restaurants: parsed.restaurants || [],
    neighborhoods_for_wandering: parsed.neighborhoods_for_wandering || [],
    tourist_traps: parsed.tourist_traps || [],
    seasonal_highlights: parsed.seasonal_highlights || [],
  };
}

export function mergeResearch(
  existing: CityResearch | undefined,
  newResearch: CityResearch,
): CityResearch {
  if (!existing) return newResearch;

  // Merge without duplicates (by name)
  const existingActivityNames = new Set(existing.activities.map(a => a.name));
  const existingRestaurantNames = new Set(existing.restaurants.map(r => r.name));
  const existingNeighborhoods = new Set(existing.neighborhoods_for_wandering.map(n => n.name));
  const existingTraps = new Set(existing.tourist_traps.map(t => t.name));

  return {
    activities: [
      ...existing.activities,
      ...newResearch.activities.filter(a => !existingActivityNames.has(a.name)),
    ],
    restaurants: [
      ...existing.restaurants,
      ...newResearch.restaurants.filter(r => !existingRestaurantNames.has(r.name)),
    ],
    neighborhoods_for_wandering: [
      ...existing.neighborhoods_for_wandering,
      ...newResearch.neighborhoods_for_wandering.filter(n => !existingNeighborhoods.has(n.name)),
    ],
    tourist_traps: [
      ...existing.tourist_traps,
      ...newResearch.tourist_traps.filter(t => !existingTraps.has(t.name)),
    ],
    seasonal_highlights: [
      ...new Set([...existing.seasonal_highlights, ...newResearch.seasonal_highlights]),
    ],
  };
}

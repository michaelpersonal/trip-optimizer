import { describe, it, expect } from 'vitest';
import { mergeResearch } from '../../src/research/researcher.js';
import type { CityResearch } from '../../src/data/schemas.js';

describe('mergeResearch', () => {
  it('returns new research when no existing data', () => {
    const newData: CityResearch = {
      activities: [{ name: 'Walk', name_local: '', type: 'vibe', score: 8, authenticity: 9, notes: '', crowd_level: 'low', cost_per_person: 0, currency: 'USD', duration_hours: 2, location: 'here', source: 'llm_knowledge' }],
      restaurants: [],
      neighborhoods_for_wandering: [],
      tourist_traps: [],
      seasonal_highlights: [],
    };
    const result = mergeResearch(undefined, newData);
    expect(result.activities).toHaveLength(1);
  });

  it('merges without duplicates by name', () => {
    const existing: CityResearch = {
      activities: [{ name: 'Walk', name_local: '', type: 'vibe', score: 8, authenticity: 9, notes: '', crowd_level: 'low', cost_per_person: 0, currency: 'USD', duration_hours: 2, location: 'here', source: 'llm_knowledge' }],
      restaurants: [],
      neighborhoods_for_wandering: [],
      tourist_traps: [],
      seasonal_highlights: ['cherry blossoms'],
    };
    const newData: CityResearch = {
      activities: [
        { name: 'Walk', name_local: '', type: 'vibe', score: 8, authenticity: 9, notes: '', crowd_level: 'low', cost_per_person: 0, currency: 'USD', duration_hours: 2, location: 'here', source: 'llm_knowledge' },
        { name: 'Temple', name_local: '', type: 'culture', score: 7, authenticity: 6, notes: '', crowd_level: 'high', cost_per_person: 5, currency: 'USD', duration_hours: 1, location: 'there', source: 'llm_knowledge' },
      ],
      restaurants: [],
      neighborhoods_for_wandering: [],
      tourist_traps: [],
      seasonal_highlights: ['cherry blossoms', 'sakura festival'],
    };
    const result = mergeResearch(existing, newData);
    expect(result.activities).toHaveLength(2); // Walk (existing) + Temple (new), not Walk again
    expect(result.seasonal_highlights).toHaveLength(2); // deduped
  });
});

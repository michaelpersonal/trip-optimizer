import { describe, it, expect } from 'vitest';
import { processDebrief, type TripDebrief } from '../../src/memory/debrief-processor.js';

function makeDebrief(overrides: Partial<TripDebrief> = {}): TripDebrief {
  return {
    trip_name: 'test-trip',
    trip_dir: '/tmp/test-trip',
    debrief_date: '2026-01-15',
    overall_rating: 4,
    day_ratings: [
      { day: 1, rating: 4, surprise: 'expected', notes: '' },
      { day: 2, rating: 5, surprise: 'better', notes: 'great food' },
      { day: 3, rating: 2, surprise: 'worse', notes: 'rain all day' },
    ],
    skip_next_time: 'crowded temple, tourist bus',
    unexpected_highlights: 'hidden garden in old town',
    new_anti_patterns: 'overscheduled mornings',
    ...overrides,
  };
}

describe('processDebrief', () => {
  it('computes average rating across all days', () => {
    const result = processDebrief(makeDebrief());
    // (4 + 5 + 2) / 3 = 3.67
    expect(result.avgRating).toBeCloseTo(3.67, 1);
  });

  it('identifies better-than-expected days', () => {
    const result = processDebrief(makeDebrief());
    expect(result.betterThanExpected).toEqual([2]);
  });

  it('identifies worse-than-expected days', () => {
    const result = processDebrief(makeDebrief());
    expect(result.worseThanExpected).toEqual([3]);
  });

  it('extracts anti-patterns from both skip and anti-patterns fields', () => {
    const result = processDebrief(makeDebrief());
    expect(result.newAntiPatterns).toEqual([
      'crowded temple',
      'tourist bus',
      'overscheduled mornings',
    ]);
  });

  it('deduplicates anti-patterns across both fields', () => {
    const result = processDebrief(
      makeDebrief({
        skip_next_time: 'crowded temple',
        new_anti_patterns: 'crowded temple, noisy hotels',
      }),
    );
    expect(result.newAntiPatterns).toEqual(['crowded temple', 'noisy hotels']);
  });

  it('handles empty skip and anti-pattern fields', () => {
    const result = processDebrief(
      makeDebrief({
        skip_next_time: '',
        new_anti_patterns: '',
      }),
    );
    expect(result.newAntiPatterns).toEqual([]);
  });

  it('preserves highlights text', () => {
    const result = processDebrief(makeDebrief());
    expect(result.highlights).toBe('hidden garden in old town');
  });

  it('handles empty day_ratings', () => {
    const result = processDebrief(makeDebrief({ day_ratings: [] }));
    expect(result.avgRating).toBe(0);
    expect(result.betterThanExpected).toEqual([]);
    expect(result.worseThanExpected).toEqual([]);
  });

  it('handles all days better than expected', () => {
    const result = processDebrief(
      makeDebrief({
        day_ratings: [
          { day: 1, rating: 5, surprise: 'better', notes: '' },
          { day: 2, rating: 5, surprise: 'better', notes: '' },
        ],
      }),
    );
    expect(result.betterThanExpected).toEqual([1, 2]);
    expect(result.worseThanExpected).toEqual([]);
    expect(result.avgRating).toBe(5);
  });

  it('trims whitespace from highlights', () => {
    const result = processDebrief(
      makeDebrief({ unexpected_highlights: '  cool market   ' }),
    );
    expect(result.highlights).toBe('cool market');
  });
});

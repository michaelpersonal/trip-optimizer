export interface TripDebrief {
  trip_name: string;
  trip_dir: string;
  debrief_date: string;
  overall_rating: number;
  day_ratings: Array<{
    day: number;
    rating: number;
    surprise: 'better' | 'expected' | 'worse';
    notes: string;
  }>;
  skip_next_time: string;
  unexpected_highlights: string;
  new_anti_patterns: string;
}

export interface ProcessedDebrief {
  avgRating: number;
  betterThanExpected: number[];
  worseThanExpected: number[];
  newAntiPatterns: string[];
  highlights: string;
}

export function processDebrief(debrief: TripDebrief): ProcessedDebrief {
  const dayRatings = debrief.day_ratings;
  const avgRating =
    dayRatings.length > 0
      ? dayRatings.reduce((sum, d) => sum + d.rating, 0) / dayRatings.length
      : 0;

  const betterThanExpected = dayRatings
    .filter((d) => d.surprise === 'better')
    .map((d) => d.day);

  const worseThanExpected = dayRatings
    .filter((d) => d.surprise === 'worse')
    .map((d) => d.day);

  // Extract anti-patterns from both "skip next time" and "new anti-patterns" fields
  const rawPatterns: string[] = [];

  if (debrief.skip_next_time.trim()) {
    rawPatterns.push(
      ...debrief.skip_next_time
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  if (debrief.new_anti_patterns.trim()) {
    rawPatterns.push(
      ...debrief.new_anti_patterns
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  // Deduplicate
  const newAntiPatterns = [...new Set(rawPatterns)];

  return {
    avgRating: Math.round(avgRating * 100) / 100,
    betterThanExpected,
    worseThanExpected,
    newAntiPatterns,
    highlights: debrief.unexpected_highlights.trim(),
  };
}

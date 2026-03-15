import type { LLMProvider } from '../llm/provider.js';
import { parseJsonResponse } from '../llm/json-parser.js';
import type { TripDebrief } from './debrief-processor.js';

export interface LearnedSignals {
  preference_signals: string[];
  activity_calibration: Record<string, number>;
  anti_patterns_learned: string[];
  source_reliability: Record<string, number>;
  generated_at: string;
  trips_analyzed: number;
}

export async function generateLearnedSignals(
  provider: LLMProvider,
  debriefs: TripDebrief[],
): Promise<LearnedSignals> {
  const debriefSummaries = debriefs.map((d) => ({
    trip: d.trip_name,
    date: d.debrief_date,
    overall_rating: d.overall_rating,
    day_ratings: d.day_ratings,
    skip_next_time: d.skip_next_time,
    highlights: d.unexpected_highlights,
    anti_patterns: d.new_anti_patterns,
  }));

  const prompt = `You are a travel preference analyst. Given the following trip debrief data from ${debriefs.length} trip(s), extract patterns about the traveler's preferences.

DEBRIEF DATA:
${JSON.stringify(debriefSummaries, null, 2)}

Analyze the data and return a JSON object with exactly these fields:
- "preference_signals": array of strings — inferred travel preferences (e.g., "prefers walking neighborhoods over bus tours", "enjoys street food over fine dining")
- "activity_calibration": object mapping activity type strings to rating deltas (e.g., {"museum": -0.5, "street_food": +1.2, "hiking": +0.8}) — positive means they rated these higher than expected, negative means lower
- "anti_patterns_learned": array of strings — things the traveler consistently dislikes or wants to avoid
- "source_reliability": object mapping source names to reliability scores 0-1 (leave empty {} if no source data)

Return ONLY the JSON object, no other text.`;

  const response = await provider.complete(prompt, 2000);
  const parsed = parseJsonResponse(response);

  return {
    preference_signals: parsed.preference_signals ?? [],
    activity_calibration: parsed.activity_calibration ?? {},
    anti_patterns_learned: parsed.anti_patterns_learned ?? [],
    source_reliability: parsed.source_reliability ?? {},
    generated_at: new Date().toISOString(),
    trips_analyzed: debriefs.length,
  };
}

// Trip constraints (from constraints.yaml)
export interface TripConstraints {
  trip: {
    name: string;
    start_date: string;
    end_date: string;
    total_days: number;
    travelers: number;
    origin: string;
  };
  cities: Array<{
    name: string;
    key: string;
    min_days: number;
    max_days: number;
  }>;
  hard_requirements: string[];
  preferences: {
    priority_order: string[];
    anti_patterns: string[];
    pro_patterns: string[];
  };
  dietary: string[];
  loyalty_program: string;
  budget: {
    total: number;
    currency: string;
  };
}

// Scoring rubrics (from rubrics.yaml)
export interface SubDimension {
  description: string;
  anchors: Record<number, string>;
}

export interface Dimension {
  weight: number;
  sub_dimensions: Record<string, SubDimension>;
}

export interface PenaltyRule {
  rule: string;
  penalty: number;
}

export interface Rubrics {
  dimensions: Record<string, Dimension>;
  adversarial_penalties: Record<string, PenaltyRule[]> & {
    max_penalty_per_dimension?: number;
  };
}

// Activities database
export interface ActivityEntry {
  name: string;
  name_local?: string;
  type: string;
  score: number;
  authenticity: number;
  uniqueness?: number;
  notes: string;
  crowd_level?: string;
  cost_per_person: number;
  currency: string;
  duration_hours: number;
  location: string;
  best_time?: string;
  seasonal?: string | null;
  source: string;
}

export interface RestaurantEntry {
  name: string;
  name_local?: string;
  cuisine: string;
  score: number;
  authenticity: number;
  notes: string;
  cost_per_person: number;
  currency: string;
  location: string;
  reservation_needed: boolean;
  source: string;
}

export interface CityResearch {
  activities: ActivityEntry[];
  restaurants: RestaurantEntry[];
  neighborhoods_for_wandering: Array<{
    name: string;
    vibe_score: number;
    walkability: string;
    notes: string;
  }>;
  tourist_traps: Array<{
    name: string;
    reason: string;
  }>;
  seasonal_highlights: string[];
}

export type ActivitiesDB = Record<string, CityResearch>;

// Score results
export interface SubDimensionScore {
  score: number;
  note: string;
}

export interface DimensionResult {
  score: number;
  weight: number;
  sub_dimensions: Record<string, SubDimensionScore>;
  penalty?: number;
  score_before_penalty?: number;
  holistic_adjustment?: number;
  holistic_reason?: string;
}

export interface Penalty {
  category: string;
  day: number;
  issue: string;
  penalty: number;
}

export interface Adjustment {
  dimension: string;
  adjustment: number;
  reason: string;
}

export interface AbsoluteScoreResult {
  mode: 'absolute';
  composite_score: number;
  components: Record<string, DimensionResult>;
  penalties: Penalty[];
  holistic_adjustments: Adjustment[];
  scored_at: string;
  model: string;
}

export interface ComparativeScoreResult {
  mode: 'comparative';
  verdict: 'better' | 'worse' | 'neutral';
  composite_delta: number;
  sub_dimension_deltas: Record<string, number>;
  dimension_deltas: Record<string, { delta: number; weight: number; affected_subs: Record<string, number> }>;
  mutation: string;
  scored_at: string;
  model: string;
}

// Mutation types
export type MutationType = 'SWAP' | 'REALLOCATE' | 'REORDER' | 'UPGRADE' | 'SIMPLIFY' | 'RESEARCH';

export interface MutationResult {
  type: MutationType;
  description: string;
  newPlanContent: string;
}

export interface IterationLog {
  iteration: number;
  commit: string;
  score_before: number;
  score_after: number;
  delta: number;
  status: 'keep' | 'discard';
  mutation_type: MutationType;
  description: string;
}

// Plan schema types and ID generators for the agent CLI system.

// ── Constants ──────────────────────────────────────────────────────────

export const SEGMENT_TYPES = ['activity', 'meal', 'transit', 'free_time', 'hotel'] as const;
export const PERIODS = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'] as const;
export const PROPOSAL_STATUSES = ['pending', 'applied', 'rejected', 'needs_clarification'] as const;
export const INTENT_TYPES = ['direct_override', 'scoped_reoptimize', 'structural_change'] as const;

// ── Derived literal types ──────────────────────────────────────────────

export type SegmentType = (typeof SEGMENT_TYPES)[number];
export type Period = (typeof PERIODS)[number];
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export type IntentType = (typeof INTENT_TYPES)[number];

// ── Core plan types ────────────────────────────────────────────────────

export interface Segment {
  id: string;
  type: SegmentType;
  period: Period;
  title: string;
  details: string;
  location: string;
  start_time: string;
  end_time: string;
  tags: string[];
}

export interface Transit {
  mode: string;
  detail: string;
}

export interface Day {
  day_index: number;
  date: string;
  city: string;
  hotel: string | null;
  transit: Transit | null;
  segments: Segment[];
  notes: string;
}

export interface PlanScore {
  composite: number;
  components: Record<string, unknown>;
}

export interface Plan {
  version_id: string;
  parent_version_id: string | null;
  created_at: string;
  created_by: string;
  score: PlanScore;
  days: Day[];
}

// ── Proposal types ─────────────────────────────────────────────────────

export interface ProposalScope {
  day_index?: number;
  segment_id?: string;
  period?: Period;
}

export interface ImpactSummary {
  changed_segments: string[];
  score_before: number;
  score_after: number;
  score_delta: number;
  tradeoffs: string[];
}

export interface ClarificationOption {
  day_index: number;
  segment_id: string;
  title: string;
}

export interface Proposal {
  proposal_id: string;
  trip_id: string;
  base_version_id: string;
  status: ProposalStatus;
  requested_by: string;
  requested_at: string;
  request_language: string;
  raw_request: string;
  intent: IntentType;
  scope: ProposalScope;
  candidate_plan: Plan | null;
  impact_summary: ImpactSummary | null;
  explanation: Record<string, string>;
  clarification?: {
    question: string;
    options: ClarificationOption[];
  };
}

// ── Trip registry types ────────────────────────────────────────────────

export interface TripRegistryEntry {
  path: string;
  title: string;
  created_at: string;
  status: 'active' | 'archived';
}

export interface TripRegistry {
  trips: Record<string, TripRegistryEntry>;
  default_trip: string | null;
}

// ── ID generators ──────────────────────────────────────────────────────

export function createSegmentId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `seg_${timestamp}${random}`;
}

export function createVersionId(num: number): string {
  return `v_${String(num).padStart(3, '0')}`;
}

export function createProposalId(rawRequest: string): string {
  const unixSeconds = Math.floor(Date.now() / 1000);
  const slug = rawRequest
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('_')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  return `prop_${unixSeconds}_${slug}`;
}

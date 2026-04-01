# Agent CLI & iMessage Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured plan data, trip registry, proposal lifecycle, and agent CLI commands to Trip Optimizer so it can be orchestrated by OpenClaw via iMessage.

**Architecture:** `plan.json` becomes the structured source of truth alongside `plan.md`. A global trip registry enables ID-based addressing. New CLI commands (`trip`, `ask`, `propose`, `apply`, `reject`, `proposals`, `reoptimize`, `migrate`) expose agent-native interfaces with `--json` output envelopes. Proposals are files in a `proposals/` directory within each trip.

**Tech Stack:** TypeScript, Commander.js, Vitest, simple-git, js-yaml, pdfkit

**Design doc:** `docs/plans/2026-04-01-agent-cli-imessage-design.md`

---

### Task 1: Plan Schema Types (`src/data/plan-schema.ts`)

**Files:**
- Create: `src/data/plan-schema.ts`
- Test: `tests/data/plan-schema.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/data/plan-schema.test.ts
import { describe, it, expect } from 'vitest';
import {
  type Plan, type Day, type Segment, type Proposal,
  type TripRegistryEntry, type TripRegistry,
  type ProposalScope, type ImpactSummary,
  createSegmentId, createVersionId, createProposalId,
  SEGMENT_TYPES, PERIODS, PROPOSAL_STATUSES, INTENT_TYPES,
} from '../../src/data/plan-schema.js';

describe('plan-schema', () => {
  describe('createSegmentId', () => {
    it('generates unique segment IDs with seg_ prefix', () => {
      const id1 = createSegmentId();
      const id2 = createSegmentId();
      expect(id1).toMatch(/^seg_[a-z0-9]+$/);
      expect(id2).toMatch(/^seg_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createVersionId', () => {
    it('generates version IDs with v_ prefix and padded number', () => {
      expect(createVersionId(1)).toBe('v_001');
      expect(createVersionId(42)).toBe('v_042');
      expect(createVersionId(100)).toBe('v_100');
    });
  });

  describe('createProposalId', () => {
    it('generates proposal IDs with timestamp and slug', () => {
      const id = createProposalId('replace lunch with local food');
      expect(id).toMatch(/^prop_\d+_replace_lunch_with/);
    });

    it('handles empty slug', () => {
      const id = createProposalId('');
      expect(id).toMatch(/^prop_\d+_change$/);
    });
  });

  describe('type constants', () => {
    it('exports segment types', () => {
      expect(SEGMENT_TYPES).toContain('activity');
      expect(SEGMENT_TYPES).toContain('meal');
      expect(SEGMENT_TYPES).toContain('transit');
      expect(SEGMENT_TYPES).toContain('free_time');
    });

    it('exports periods', () => {
      expect(PERIODS).toContain('morning');
      expect(PERIODS).toContain('lunch');
      expect(PERIODS).toContain('afternoon');
      expect(PERIODS).toContain('dinner');
      expect(PERIODS).toContain('evening');
    });

    it('exports proposal statuses', () => {
      expect(PROPOSAL_STATUSES).toContain('pending');
      expect(PROPOSAL_STATUSES).toContain('applied');
      expect(PROPOSAL_STATUSES).toContain('rejected');
      expect(PROPOSAL_STATUSES).toContain('needs_clarification');
    });

    it('exports intent types', () => {
      expect(INTENT_TYPES).toContain('direct_override');
      expect(INTENT_TYPES).toContain('scoped_reoptimize');
      expect(INTENT_TYPES).toContain('structural_change');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/plan-schema.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/data/plan-schema.ts

// --- Constants ---

export const SEGMENT_TYPES = ['activity', 'meal', 'transit', 'free_time', 'hotel'] as const;
export type SegmentType = typeof SEGMENT_TYPES[number];

export const PERIODS = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'] as const;
export type Period = typeof PERIODS[number];

export const PROPOSAL_STATUSES = ['pending', 'applied', 'rejected', 'needs_clarification'] as const;
export type ProposalStatus = typeof PROPOSAL_STATUSES[number];

export const INTENT_TYPES = ['direct_override', 'scoped_reoptimize', 'structural_change'] as const;
export type IntentType = typeof INTENT_TYPES[number];

// --- Plan Types ---

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

// --- Proposal Types ---

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
  tradeoffs: string;
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

// --- Registry Types ---

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

// --- ID Generators ---

let segCounter = 0;

export function createSegmentId(): string {
  segCounter++;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `seg_${ts}${rand}`;
}

export function createVersionId(num: number): string {
  return `v_${String(num).padStart(3, '0')}`;
}

export function createProposalId(rawRequest: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const slug = rawRequest
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('_') || 'change';
  return `prop_${ts}_${slug}`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/data/plan-schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/data/plan-schema.ts tests/data/plan-schema.test.ts
git commit -m "feat: add plan schema types and ID generators"
```

---

### Task 2: JSON Output Utilities (`src/cli-utils/json-output.ts`)

**Files:**
- Create: `src/cli-utils/json-output.ts`
- Test: `tests/cli-utils/json-output.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/cli-utils/json-output.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  success, error, CLIError, ERROR_CODES,
  type SuccessEnvelope, type ErrorEnvelope,
} from '../../src/cli-utils/json-output.js';

describe('json-output', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('success', () => {
    it('writes JSON envelope to stdout', () => {
      success('trip.list', 'japan-2027', { trips: [] });
      const written = stdoutSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(written);
      expect(parsed.ok).toBe(true);
      expect(parsed.command).toBe('trip.list');
      expect(parsed.trip_id).toBe('japan-2027');
      expect(parsed.data).toEqual({ trips: [] });
    });

    it('omits trip_id when null', () => {
      success('trip.list', null, { trips: [] });
      const written = stdoutSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(written);
      expect(parsed.trip_id).toBeUndefined();
    });
  });

  describe('error', () => {
    it('writes error envelope to stdout', () => {
      error('trip.show', 'TRIP_NOT_FOUND', 'japan-2027');
      const written = stdoutSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(written);
      expect(parsed.ok).toBe(false);
      expect(parsed.command).toBe('trip.show');
      expect(parsed.error.code).toBe('TRIP_NOT_FOUND');
      expect(parsed.error.message).toBeTruthy();
      expect(parsed.error.hint).toBeTruthy();
    });
  });

  describe('CLIError', () => {
    it('creates error with code, message, and hint', () => {
      const err = new CLIError('TRIP_NOT_FOUND');
      expect(err.code).toBe('TRIP_NOT_FOUND');
      expect(err.message).toBeTruthy();
      expect(err.hint).toBeTruthy();
    });
  });

  describe('ERROR_CODES', () => {
    it('has entries for all defined codes', () => {
      const codes = [
        'NO_TRIP_CONTEXT', 'TRIP_NOT_FOUND', 'TRIP_ID_CONFLICT',
        'PROPOSAL_NOT_FOUND', 'PROPOSAL_CONFLICT',
        'NO_PLAN', 'LLM_ERROR', 'MIGRATION_FAILED',
      ];
      for (const code of codes) {
        expect(ERROR_CODES[code]).toBeDefined();
        expect(ERROR_CODES[code].message).toBeTruthy();
        expect(ERROR_CODES[code].hint).toBeTruthy();
      }
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli-utils/json-output.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/cli-utils/json-output.ts

export interface SuccessEnvelope<T = unknown> {
  ok: true;
  command: string;
  trip_id?: string;
  data: T;
}

export interface ErrorEnvelope {
  ok: false;
  command: string;
  error: {
    code: string;
    message: string;
    hint: string;
  };
}

export const ERROR_CODES: Record<string, { message: string; hint: string }> = {
  NO_TRIP_CONTEXT: {
    message: 'No trip context available',
    hint: "Provide --trip <id> flag, or run 'trip-optimizer trip set-default <id>' to set a default, or run from a trip directory",
  },
  TRIP_NOT_FOUND: {
    message: 'Trip ID not in registry',
    hint: "Run 'trip-optimizer trip list --json' to see registered trips, or 'trip-optimizer migrate <path>' to register an existing trip",
  },
  TRIP_ID_CONFLICT: {
    message: 'Trip ID already registered',
    hint: "Run 'trip-optimizer migrate <path> --id <new-id>' to use a different trip ID",
  },
  PROPOSAL_NOT_FOUND: {
    message: 'Proposal ID does not exist',
    hint: "Run 'trip-optimizer proposals --trip <id> --json' to see available proposals",
  },
  PROPOSAL_CONFLICT: {
    message: 'Plan has moved past this proposal\'s base version',
    hint: "Plan has changed since this proposal was created. Run 'trip-optimizer propose --trip <id> --request \"<original request>\" --json' to regenerate against the current plan",
  },
  NO_PLAN: {
    message: 'Trip exists but has no plan.json',
    hint: "Run 'trip-optimizer run' in the trip directory to generate an initial plan, or 'trip-optimizer migrate <path>' if a plan.md already exists",
  },
  LLM_ERROR: {
    message: 'Model call failed',
    hint: "Check API key with 'trip-optimizer config' or retry. If using Vertex AI, run 'gcloud auth application-default login'",
  },
  MIGRATION_FAILED: {
    message: 'Could not parse existing plan.md',
    hint: "Ensure the directory contains a valid plan.md. Run 'trip-optimizer migrate <path> --verbose' for details",
  },
};

export function success<T>(command: string, tripId: string | null, data: T): void {
  const envelope: SuccessEnvelope<T> = { ok: true, command, data };
  if (tripId) (envelope as any).trip_id = tripId;
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

export function error(command: string, code: string, tripId?: string): void {
  const info = ERROR_CODES[code] || { message: code, hint: 'No hint available' };
  const envelope: ErrorEnvelope = {
    ok: false,
    command,
    error: { code, message: info.message, hint: info.hint },
  };
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

export class CLIError extends Error {
  code: string;
  hint: string;

  constructor(code: string, overrideMessage?: string) {
    const info = ERROR_CODES[code] || { message: code, hint: 'No hint available' };
    super(overrideMessage || info.message);
    this.code = code;
    this.hint = info.hint;
  }
}

export function stderrLog(msg: string): void {
  process.stderr.write(msg + '\n');
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli-utils/json-output.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli-utils/json-output.ts tests/cli-utils/json-output.test.ts
git commit -m "feat: add JSON output envelope and error code utilities"
```

---

### Task 3: Trip Registry (`src/data/registry.ts`)

**Files:**
- Create: `src/data/registry.ts`
- Modify: `src/data/paths.ts` — add `getRegistryPath()`
- Test: `tests/data/registry.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/data/registry.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  loadRegistry, saveRegistry, registerTrip, unregisterTrip,
  getTrip, listTrips, setDefaultTrip, resolveTrip,
} from '../../src/data/registry.js';
import type { TripRegistry } from '../../src/data/plan-schema.js';

// Override registry path for tests
const testDir = path.join(os.tmpdir(), 'trip-registry-test-' + Date.now());
const testRegistryPath = path.join(testDir, 'trips.json');

vi.mock('../../src/data/paths.js', () => ({
  getGlobalDir: () => testDir,
  getRegistryPath: () => testRegistryPath,
  getConfigPath: () => path.join(testDir, 'config.json'),
  getProfilePath: () => path.join(testDir, 'profile.json'),
  getTripHistoryPath: () => path.join(testDir, 'trip-history.json'),
  getLearnedPath: () => path.join(testDir, 'learned.json'),
}));

describe('registry', () => {
  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('loadRegistry', () => {
    it('returns empty registry when file does not exist', () => {
      const reg = loadRegistry();
      expect(reg.trips).toEqual({});
      expect(reg.default_trip).toBeNull();
    });

    it('loads existing registry', () => {
      const data: TripRegistry = {
        trips: {
          'japan-2027': {
            path: '/tmp/japan',
            title: 'Japan 2027',
            created_at: '2026-04-01T00:00:00Z',
            status: 'active',
          },
        },
        default_trip: 'japan-2027',
      };
      fs.writeFileSync(testRegistryPath, JSON.stringify(data));
      const reg = loadRegistry();
      expect(reg.trips['japan-2027'].title).toBe('Japan 2027');
      expect(reg.default_trip).toBe('japan-2027');
    });
  });

  describe('registerTrip', () => {
    it('adds a trip to the registry', () => {
      registerTrip('test-trip', '/tmp/test-trip', 'Test Trip');
      const reg = loadRegistry();
      expect(reg.trips['test-trip']).toBeDefined();
      expect(reg.trips['test-trip'].path).toBe('/tmp/test-trip');
      expect(reg.trips['test-trip'].status).toBe('active');
    });

    it('sets first trip as default', () => {
      registerTrip('first', '/tmp/first', 'First');
      const reg = loadRegistry();
      expect(reg.default_trip).toBe('first');
    });

    it('does not override default when adding second trip', () => {
      registerTrip('first', '/tmp/first', 'First');
      registerTrip('second', '/tmp/second', 'Second');
      const reg = loadRegistry();
      expect(reg.default_trip).toBe('first');
    });

    it('throws on duplicate trip ID', () => {
      registerTrip('dupe', '/tmp/dupe', 'Dupe');
      expect(() => registerTrip('dupe', '/tmp/dupe2', 'Dupe 2')).toThrow();
    });
  });

  describe('resolveTrip', () => {
    it('resolves by explicit trip ID', () => {
      registerTrip('japan', '/tmp/japan', 'Japan');
      const result = resolveTrip('japan');
      expect(result.tripId).toBe('japan');
      expect(result.tripDir).toBe('/tmp/japan');
    });

    it('resolves by default trip when no ID given', () => {
      registerTrip('japan', '/tmp/japan', 'Japan');
      const result = resolveTrip(undefined);
      expect(result.tripId).toBe('japan');
    });

    it('resolves by cwd when no ID and no default', () => {
      // Create a constraints.yaml in a temp trip dir
      const tripDir = path.join(testDir, 'cwd-trip');
      fs.mkdirSync(tripDir, { recursive: true });
      fs.writeFileSync(path.join(tripDir, 'constraints.yaml'), 'trip:\n  name: CWD');
      const result = resolveTrip(undefined, tripDir);
      expect(result.tripDir).toBe(tripDir);
    });

    it('throws NO_TRIP_CONTEXT when nothing resolves', () => {
      expect(() => resolveTrip(undefined, '/tmp/nonexistent')).toThrow('NO_TRIP_CONTEXT');
    });

    it('throws TRIP_NOT_FOUND for unknown ID', () => {
      expect(() => resolveTrip('nonexistent')).toThrow('TRIP_NOT_FOUND');
    });
  });

  describe('setDefaultTrip', () => {
    it('sets default trip', () => {
      registerTrip('a', '/tmp/a', 'A');
      registerTrip('b', '/tmp/b', 'B');
      setDefaultTrip('b');
      const reg = loadRegistry();
      expect(reg.default_trip).toBe('b');
    });

    it('throws for unknown trip', () => {
      expect(() => setDefaultTrip('nonexistent')).toThrow();
    });
  });

  describe('listTrips', () => {
    it('returns all registered trips', () => {
      registerTrip('a', '/tmp/a', 'A');
      registerTrip('b', '/tmp/b', 'B');
      const trips = listTrips();
      expect(Object.keys(trips)).toEqual(['a', 'b']);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/registry.test.ts`
Expected: FAIL — module not found

**Step 3: Add `getRegistryPath` to `src/data/paths.ts`**

Add to `src/data/paths.ts`:

```typescript
export function getRegistryPath(): string {
  return path.join(getGlobalDir(), 'trips.json');
}
```

**Step 4: Write the implementation**

```typescript
// src/data/registry.ts
import fs from 'fs';
import path from 'path';
import { getGlobalDir, getRegistryPath } from './paths.js';
import type { TripRegistry, TripRegistryEntry } from './plan-schema.js';
import { CLIError } from '../cli-utils/json-output.js';

export function loadRegistry(): TripRegistry {
  const regPath = getRegistryPath();
  if (!fs.existsSync(regPath)) {
    return { trips: {}, default_trip: null };
  }
  return JSON.parse(fs.readFileSync(regPath, 'utf-8'));
}

export function saveRegistry(registry: TripRegistry): void {
  const globalDir = getGlobalDir();
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(getRegistryPath(), JSON.stringify(registry, null, 2));
}

export function registerTrip(tripId: string, tripPath: string, title: string): void {
  const registry = loadRegistry();
  if (registry.trips[tripId]) {
    throw new CLIError('TRIP_ID_CONFLICT');
  }
  registry.trips[tripId] = {
    path: tripPath,
    title,
    created_at: new Date().toISOString(),
    status: 'active',
  };
  if (!registry.default_trip) {
    registry.default_trip = tripId;
  }
  saveRegistry(registry);
}

export function unregisterTrip(tripId: string): void {
  const registry = loadRegistry();
  delete registry.trips[tripId];
  if (registry.default_trip === tripId) {
    const remaining = Object.keys(registry.trips);
    registry.default_trip = remaining.length > 0 ? remaining[0] : null;
  }
  saveRegistry(registry);
}

export function getTrip(tripId: string): TripRegistryEntry {
  const registry = loadRegistry();
  const entry = registry.trips[tripId];
  if (!entry) throw new CLIError('TRIP_NOT_FOUND');
  return entry;
}

export function listTrips(): Record<string, TripRegistryEntry> {
  return loadRegistry().trips;
}

export function setDefaultTrip(tripId: string): void {
  const registry = loadRegistry();
  if (!registry.trips[tripId]) {
    throw new CLIError('TRIP_NOT_FOUND');
  }
  registry.default_trip = tripId;
  saveRegistry(registry);
}

export function resolveTrip(
  tripId?: string,
  cwd?: string,
): { tripId: string; tripDir: string } {
  const registry = loadRegistry();

  // 1. Explicit --trip flag
  if (tripId) {
    const entry = registry.trips[tripId];
    if (!entry) throw new CLIError('TRIP_NOT_FOUND');
    return { tripId, tripDir: entry.path };
  }

  // 2. Default trip
  if (registry.default_trip && registry.trips[registry.default_trip]) {
    return {
      tripId: registry.default_trip,
      tripDir: registry.trips[registry.default_trip].path,
    };
  }

  // 3. cwd fallback
  const dir = cwd || process.cwd();
  if (fs.existsSync(path.join(dir, 'constraints.yaml'))) {
    // Find trip ID from registry by path, or use dir name
    const matchedId = Object.entries(registry.trips)
      .find(([, e]) => e.path === dir)?.[0];
    return {
      tripId: matchedId || path.basename(dir),
      tripDir: dir,
    };
  }

  throw new CLIError('NO_TRIP_CONTEXT');
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/data/registry.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/data/paths.ts src/data/registry.ts tests/data/registry.test.ts
git commit -m "feat: add trip registry with ID-based resolution"
```

---

### Task 4: Plan Renderer (`src/data/plan-renderer.ts`)

**Files:**
- Create: `src/data/plan-renderer.ts`
- Test: `tests/data/plan-renderer.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/data/plan-renderer.test.ts
import { describe, it, expect } from 'vitest';
import { renderPlanMarkdown } from '../../src/data/plan-renderer.js';
import type { Plan } from '../../src/data/plan-schema.js';

const samplePlan: Plan = {
  version_id: 'v_001',
  parent_version_id: null,
  created_at: '2026-04-01T00:00:00Z',
  created_by: 'optimizer',
  score: { composite: 82.5, components: {} },
  days: [
    {
      day_index: 1,
      date: '2027-05-28',
      city: 'Shanghai',
      hotel: 'Le Meridien',
      transit: { mode: 'flight', detail: 'NH919 14:00' },
      segments: [
        {
          id: 'seg_001',
          type: 'activity',
          period: 'morning',
          title: 'Yu Garden Old Street',
          details: 'Walk through the historic bazaar and garden complex.',
          location: 'Old City, Huangpu',
          start_time: '09:00',
          end_time: '11:30',
          tags: ['cultural', 'walking'],
        },
        {
          id: 'seg_002',
          type: 'meal',
          period: 'lunch',
          title: 'Jia Jia Tang Bao',
          details: 'Famous local soup dumplings.',
          location: 'Huanghe Road',
          start_time: '12:00',
          end_time: '13:00',
          tags: ['food', 'local'],
        },
      ],
      notes: 'Arrival day, take it easy',
    },
    {
      day_index: 2,
      date: '2027-05-29',
      city: 'Shanghai',
      hotel: 'Le Meridien',
      transit: null,
      segments: [
        {
          id: 'seg_003',
          type: 'activity',
          period: 'morning',
          title: 'French Concession Walk',
          details: 'Explore tree-lined streets and cafes.',
          location: 'Xuhui',
          start_time: '09:30',
          end_time: '12:00',
          tags: ['walking', 'culture'],
        },
      ],
      notes: '',
    },
  ],
};

describe('renderPlanMarkdown', () => {
  it('includes YAML frontmatter', () => {
    const md = renderPlanMarkdown(samplePlan, 'Japan Family 2027', 14, '2027-05-28', '2027-06-10');
    expect(md).toContain('---');
    expect(md).toContain('trip_name: "Japan Family 2027"');
    expect(md).toContain('total_days: 14');
  });

  it('includes schedule overview table', () => {
    const md = renderPlanMarkdown(samplePlan, 'Japan Family 2027', 2, '2027-05-28', '2027-05-29');
    expect(md).toContain('| Day |');
    expect(md).toContain('| 1 |');
    expect(md).toContain('Shanghai');
    expect(md).toContain('Le Meridien');
  });

  it('includes day headers', () => {
    const md = renderPlanMarkdown(samplePlan, 'Test', 2, '2027-05-28', '2027-05-29');
    expect(md).toContain('# Day 1: Shanghai');
    expect(md).toContain('# Day 2: Shanghai');
  });

  it('includes period sections with segments', () => {
    const md = renderPlanMarkdown(samplePlan, 'Test', 2, '2027-05-28', '2027-05-29');
    expect(md).toContain('## Morning');
    expect(md).toContain('Yu Garden Old Street');
    expect(md).toContain('## Lunch');
    expect(md).toContain('Jia Jia Tang Bao');
  });

  it('includes hotel and transit lines', () => {
    const md = renderPlanMarkdown(samplePlan, 'Test', 2, '2027-05-28', '2027-05-29');
    expect(md).toContain('**Hotel:** Le Meridien');
    expect(md).toContain('**Transit:** flight — NH919 14:00');
  });

  it('includes day notes when present', () => {
    const md = renderPlanMarkdown(samplePlan, 'Test', 2, '2027-05-28', '2027-05-29');
    expect(md).toContain('Arrival day, take it easy');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/plan-renderer.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/data/plan-renderer.ts
import type { Plan, Day, Segment, Period } from './plan-schema.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return DAY_NAMES[d.getUTCDay()];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

const PERIOD_ORDER: Period[] = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'];

function periodHeading(period: Period): string {
  return period.charAt(0).toUpperCase() + period.slice(1);
}

export function renderPlanMarkdown(
  plan: Plan,
  tripName: string,
  totalDays: number,
  startDate: string,
  endDate: string,
): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`trip_name: "${tripName}"`);
  lines.push(`total_days: ${totalDays}`);
  lines.push(`start_date: ${startDate}`);
  lines.push(`end_date: ${endDate}`);
  lines.push('---');
  lines.push('');

  // Schedule overview table
  lines.push('## Schedule Overview');
  lines.push('');
  lines.push('| Day | Date | DoW | Location | Hotel | Flight/Train | Notes |');
  lines.push('|-----|------|-----|----------|-------|--------------|-------|');
  for (const day of plan.days) {
    const dow = getDayOfWeek(day.date);
    const date = formatDate(day.date);
    const hotel = day.hotel || '—';
    const transit = day.transit ? `${day.transit.mode} ${day.transit.detail}` : '—';
    const notes = day.notes || '—';
    lines.push(`| ${day.day_index} | ${date} | ${dow} | ${day.city} | ${hotel} | ${transit} | ${notes} |`);
  }
  lines.push('');

  // Day sections
  for (const day of plan.days) {
    lines.push(`# Day ${day.day_index}: ${day.city}`);
    lines.push('');

    // Group segments by period
    const byPeriod = new Map<Period, Segment[]>();
    for (const seg of day.segments) {
      const list = byPeriod.get(seg.period) || [];
      list.push(seg);
      byPeriod.set(seg.period, list);
    }

    for (const period of PERIOD_ORDER) {
      const segs = byPeriod.get(period);
      if (!segs || segs.length === 0) continue;

      lines.push(`## ${periodHeading(period)}`);
      for (const seg of segs) {
        lines.push(`**${seg.title}** (${seg.start_time}–${seg.end_time})`);
        if (seg.details) lines.push(seg.details);
        if (seg.location) lines.push(`*${seg.location}*`);
        lines.push('');
      }
    }

    if (day.hotel) lines.push(`**Hotel:** ${day.hotel}`);
    if (day.transit) lines.push(`**Transit:** ${day.transit.mode} — ${day.transit.detail}`);
    if (day.notes) lines.push(`*${day.notes}*`);
    lines.push('');
  }

  return lines.join('\n');
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/data/plan-renderer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/data/plan-renderer.ts tests/data/plan-renderer.test.ts
git commit -m "feat: add deterministic plan.json to plan.md renderer"
```

---

### Task 5: Trip Command (`src/commands/trip.ts`)

**Files:**
- Create: `src/commands/trip.ts`
- Modify: `src/cli.ts` — register `trip` command
- Test: `tests/commands/trip.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/commands/trip.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const testDir = path.join(os.tmpdir(), 'trip-cmd-test-' + Date.now());
const testRegistryPath = path.join(testDir, 'trips.json');

vi.mock('../../src/data/paths.js', () => ({
  getGlobalDir: () => testDir,
  getRegistryPath: () => testRegistryPath,
  getConfigPath: () => path.join(testDir, 'config.json'),
  getProfilePath: () => path.join(testDir, 'profile.json'),
  getTripHistoryPath: () => path.join(testDir, 'trip-history.json'),
  getLearnedPath: () => path.join(testDir, 'learned.json'),
}));

import { tripListAction, tripShowAction, tripSetDefaultAction } from '../../src/commands/trip.js';
import { registerTrip } from '../../src/data/registry.js';
import type { Plan } from '../../src/data/plan-schema.js';

describe('trip commands', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('tripListAction', () => {
    it('outputs empty list when no trips registered', () => {
      tripListAction({ json: true });
      const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
      expect(output.ok).toBe(true);
      expect(output.data.trips).toEqual({});
    });

    it('lists registered trips', () => {
      registerTrip('japan', '/tmp/japan', 'Japan');
      tripListAction({ json: true });
      const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
      expect(output.data.trips['japan']).toBeDefined();
    });
  });

  describe('tripShowAction', () => {
    it('shows plan data for a trip', () => {
      const tripDir = path.join(testDir, 'japan');
      fs.mkdirSync(tripDir, { recursive: true });
      registerTrip('japan', tripDir, 'Japan');

      const plan: Plan = {
        version_id: 'v_001',
        parent_version_id: null,
        created_at: '2026-04-01T00:00:00Z',
        created_by: 'test',
        score: { composite: 80, components: {} },
        days: [{
          day_index: 1, date: '2027-05-28', city: 'Tokyo',
          hotel: 'Marriott', transit: null, segments: [], notes: '',
        }],
      };
      fs.writeFileSync(path.join(tripDir, 'plan.json'), JSON.stringify(plan));

      tripShowAction({ trip: 'japan', json: true });
      const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
      expect(output.ok).toBe(true);
      expect(output.data.version_id).toBe('v_001');
      expect(output.data.days).toHaveLength(1);
    });

    it('filters by day when --day specified', () => {
      const tripDir = path.join(testDir, 'japan2');
      fs.mkdirSync(tripDir, { recursive: true });
      registerTrip('japan2', tripDir, 'Japan 2');

      const plan: Plan = {
        version_id: 'v_001', parent_version_id: null,
        created_at: '2026-04-01T00:00:00Z', created_by: 'test',
        score: { composite: 80, components: {} },
        days: [
          { day_index: 1, date: '2027-05-28', city: 'Tokyo', hotel: null, transit: null, segments: [], notes: '' },
          { day_index: 2, date: '2027-05-29', city: 'Kyoto', hotel: null, transit: null, segments: [], notes: '' },
        ],
      };
      fs.writeFileSync(path.join(tripDir, 'plan.json'), JSON.stringify(plan));

      tripShowAction({ trip: 'japan2', day: 2, json: true });
      const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
      expect(output.data.days).toHaveLength(1);
      expect(output.data.days[0].city).toBe('Kyoto');
    });

    it('errors when plan.json missing', () => {
      const tripDir = path.join(testDir, 'empty');
      fs.mkdirSync(tripDir, { recursive: true });
      registerTrip('empty', tripDir, 'Empty');

      tripShowAction({ trip: 'empty', json: true });
      const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
      expect(output.ok).toBe(false);
      expect(output.error.code).toBe('NO_PLAN');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commands/trip.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/commands/trip.ts
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { resolveTrip, listTrips, setDefaultTrip, loadRegistry } from '../data/registry.js';
import { success, error } from '../cli-utils/json-output.js';
import type { Plan } from '../data/plan-schema.js';

interface TripListOptions { json?: boolean }
interface TripShowOptions { trip?: string; day?: number; json?: boolean; lang?: string }
interface TripSetDefaultOptions {}

export function tripListAction(options: TripListOptions): void {
  const trips = listTrips();
  const registry = loadRegistry();

  if (options.json) {
    success('trip.list', null, { trips, default_trip: registry.default_trip });
    return;
  }

  const entries = Object.entries(trips);
  if (entries.length === 0) {
    console.log(chalk.yellow('\n  No trips registered. Run: trip-optimizer init <name>\n'));
    return;
  }

  console.log(chalk.bold('\n  Registered trips:\n'));
  for (const [id, entry] of entries) {
    const isDefault = id === registry.default_trip ? chalk.green(' (default)') : '';
    console.log(`    ${chalk.bold(id)}${isDefault}`);
    console.log(`      ${chalk.dim(entry.path)}`);
    console.log(`      ${entry.title} — ${entry.status}`);
  }
  console.log();
}

export function tripShowAction(options: TripShowOptions): void {
  let resolved;
  try {
    resolved = resolveTrip(options.trip);
  } catch (err: any) {
    if (options.json) {
      error('trip.show', err.code || 'TRIP_NOT_FOUND');
    } else {
      console.log(chalk.red(`\n  ${err.message}\n  ${err.hint}\n`));
    }
    return;
  }

  const planPath = path.join(resolved.tripDir, 'plan.json');
  if (!fs.existsSync(planPath)) {
    if (options.json) {
      error('trip.show', 'NO_PLAN');
    } else {
      console.log(chalk.red('\n  No plan.json found. Run: trip-optimizer migrate <path>\n'));
    }
    return;
  }

  const plan: Plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
  let outputPlan = plan;

  if (options.day) {
    const filteredDays = plan.days.filter(d => d.day_index === options.day);
    outputPlan = { ...plan, days: filteredDays };
  }

  if (options.json) {
    success('trip.show', resolved.tripId, outputPlan);
    return;
  }

  // Terminal display
  console.log(chalk.bold(`\n  ${resolved.tripId} — v${plan.version_id}`));
  console.log(`  Score: ${plan.score.composite}/100\n`);
  for (const day of outputPlan.days) {
    console.log(chalk.bold.magenta(`  Day ${day.day_index}: ${day.city} (${day.date})`));
    for (const seg of day.segments) {
      console.log(`    ${chalk.dim(seg.start_time)} ${chalk.bold(seg.title)}`);
    }
    if (day.hotel) console.log(chalk.blue(`    Hotel: ${day.hotel}`));
    console.log();
  }
}

export function tripSetDefaultAction(tripId: string): void {
  try {
    setDefaultTrip(tripId);
    console.log(chalk.green(`\n  Default trip set to: ${tripId}\n`));
  } catch (err: any) {
    console.log(chalk.red(`\n  ${err.message}\n  ${err.hint}\n`));
  }
}
```

**Step 4: Register in `src/cli.ts`**

Add after existing command imports at the top of `src/cli.ts`:

```typescript
import { tripListAction, tripShowAction, tripSetDefaultAction } from './commands/trip.js';
```

Add before `program.parse()`:

```typescript
const tripCmd = program
  .command('trip')
  .description('Manage trips');

tripCmd
  .command('list')
  .description('List registered trips')
  .option('--json', 'JSON output')
  .action((options) => tripListAction(options));

tripCmd
  .command('show')
  .description('Show trip plan')
  .option('--trip <id>', 'Trip ID')
  .option('--day <n>', 'Show specific day', parseInt)
  .option('--lang <code>', 'Language (en|zh)')
  .option('--json', 'JSON output')
  .action((options) => tripShowAction(options));

tripCmd
  .command('set-default <id>')
  .description('Set default trip')
  .action((id) => tripSetDefaultAction(id));
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/commands/trip.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/commands/trip.ts src/cli.ts tests/commands/trip.test.ts
git commit -m "feat: add trip list/show/set-default commands with --json"
```

---

### Task 6: Proposal File I/O (`src/data/proposals.ts`)

**Files:**
- Create: `src/data/proposals.ts`
- Test: `tests/data/proposals.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/data/proposals.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  writeProposal, readProposal, listProposals, updateProposalStatus,
} from '../../src/data/proposals.js';
import type { Proposal } from '../../src/data/plan-schema.js';

const testDir = path.join(os.tmpdir(), 'proposals-test-' + Date.now());

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposal_id: 'prop_123_test',
    trip_id: 'japan',
    base_version_id: 'v_001',
    status: 'pending',
    requested_by: 'michael',
    requested_at: '2026-04-01T00:00:00Z',
    request_language: 'en',
    raw_request: 'change lunch',
    intent: 'scoped_reoptimize',
    scope: { day_index: 3 },
    candidate_plan: null,
    impact_summary: null,
    explanation: {},
    ...overrides,
  };
}

describe('proposals', () => {
  beforeEach(() => fs.mkdirSync(testDir, { recursive: true }));
  afterEach(() => fs.rmSync(testDir, { recursive: true, force: true }));

  it('writes and reads a proposal', () => {
    const p = makeProposal();
    writeProposal(testDir, p);
    const read = readProposal(testDir, p.proposal_id);
    expect(read.proposal_id).toBe(p.proposal_id);
    expect(read.status).toBe('pending');
  });

  it('lists proposals', () => {
    writeProposal(testDir, makeProposal({ proposal_id: 'prop_1_a' }));
    writeProposal(testDir, makeProposal({ proposal_id: 'prop_2_b', status: 'applied' }));
    const all = listProposals(testDir);
    expect(all).toHaveLength(2);
  });

  it('filters proposals by status', () => {
    writeProposal(testDir, makeProposal({ proposal_id: 'prop_1_a' }));
    writeProposal(testDir, makeProposal({ proposal_id: 'prop_2_b', status: 'applied' }));
    const pending = listProposals(testDir, 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].proposal_id).toBe('prop_1_a');
  });

  it('updates proposal status', () => {
    writeProposal(testDir, makeProposal());
    updateProposalStatus(testDir, 'prop_123_test', 'applied');
    const updated = readProposal(testDir, 'prop_123_test');
    expect(updated.status).toBe('applied');
  });

  it('throws for nonexistent proposal', () => {
    expect(() => readProposal(testDir, 'nonexistent')).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/proposals.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/data/proposals.ts
import fs from 'fs';
import path from 'path';
import type { Proposal, ProposalStatus } from './plan-schema.js';
import { CLIError } from '../cli-utils/json-output.js';

function proposalsDir(tripDir: string): string {
  const dir = path.join(tripDir, 'proposals');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function proposalPath(tripDir: string, proposalId: string): string {
  return path.join(proposalsDir(tripDir), `${proposalId}.json`);
}

export function writeProposal(tripDir: string, proposal: Proposal): void {
  const filePath = proposalPath(tripDir, proposal.proposal_id);
  fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2));
}

export function readProposal(tripDir: string, proposalId: string): Proposal {
  const filePath = proposalPath(tripDir, proposalId);
  if (!fs.existsSync(filePath)) {
    throw new CLIError('PROPOSAL_NOT_FOUND');
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function listProposals(tripDir: string, status?: ProposalStatus): Proposal[] {
  const dir = proposalsDir(tripDir);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const proposals: Proposal[] = files.map(f =>
    JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
  );
  if (status) {
    return proposals.filter(p => p.status === status);
  }
  return proposals;
}

export function updateProposalStatus(
  tripDir: string,
  proposalId: string,
  status: ProposalStatus,
): Proposal {
  const proposal = readProposal(tripDir, proposalId);
  proposal.status = status;
  writeProposal(tripDir, proposal);
  return proposal;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/data/proposals.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/data/proposals.ts tests/data/proposals.test.ts
git commit -m "feat: add proposal file I/O — write, read, list, update status"
```

---

### Task 7: Proposals List Command (`src/commands/proposals.ts`)

**Files:**
- Create: `src/commands/proposals.ts`
- Modify: `src/cli.ts` — register `proposals` command

**Step 1: Write the implementation** (light command, test through integration)

```typescript
// src/commands/proposals.ts
import chalk from 'chalk';
import { resolveTrip } from '../data/registry.js';
import { listProposals } from '../data/proposals.js';
import { success, error } from '../cli-utils/json-output.js';
import type { ProposalStatus } from '../data/plan-schema.js';

interface ProposalsOptions {
  trip?: string;
  status?: string;
  json?: boolean;
}

export function proposalsAction(options: ProposalsOptions): void {
  let resolved;
  try {
    resolved = resolveTrip(options.trip);
  } catch (err: any) {
    if (options.json) { error('proposals', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n  ${err.hint}\n`)); }
    return;
  }

  const statusFilter = options.status as ProposalStatus | undefined;
  const proposals = listProposals(resolved.tripDir, statusFilter);

  if (options.json) {
    success('proposals', resolved.tripId, { proposals });
    return;
  }

  if (proposals.length === 0) {
    console.log(chalk.yellow('\n  No proposals found.\n'));
    return;
  }

  console.log(chalk.bold(`\n  Proposals for ${resolved.tripId}:\n`));
  for (const p of proposals) {
    const statusColor = p.status === 'pending' ? chalk.yellow : p.status === 'applied' ? chalk.green : chalk.red;
    console.log(`    ${chalk.bold(p.proposal_id)}  ${statusColor(p.status)}`);
    console.log(`      ${p.raw_request}`);
    if (p.impact_summary) {
      const delta = p.impact_summary.score_delta;
      console.log(`      Score: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`);
    }
    console.log();
  }
}
```

**Step 2: Register in `src/cli.ts`**

Add import and command registration:

```typescript
import { proposalsAction } from './commands/proposals.js';

program
  .command('proposals')
  .description('List proposals for a trip')
  .option('--trip <id>', 'Trip ID')
  .option('--status <status>', 'Filter by status (pending|applied|rejected)')
  .option('--json', 'JSON output')
  .action((options) => proposalsAction(options));
```

**Step 3: Commit**

```bash
git add src/commands/proposals.ts src/cli.ts
git commit -m "feat: add proposals list command"
```

---

### Task 8: Apply Command (`src/commands/apply.ts`)

**Files:**
- Create: `src/commands/apply.ts`
- Modify: `src/cli.ts` — register `apply` command
- Test: `tests/commands/apply.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/commands/apply.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const testDir = path.join(os.tmpdir(), 'apply-cmd-test-' + Date.now());
const testRegistryPath = path.join(testDir, 'trips.json');

vi.mock('../../src/data/paths.js', () => ({
  getGlobalDir: () => testDir,
  getRegistryPath: () => testRegistryPath,
  getConfigPath: () => path.join(testDir, 'config.json'),
  getProfilePath: () => path.join(testDir, 'profile.json'),
  getTripHistoryPath: () => path.join(testDir, 'trip-history.json'),
  getLearnedPath: () => path.join(testDir, 'learned.json'),
}));

// Mock simple-git to avoid actual git operations in tests
vi.mock('simple-git', () => ({
  simpleGit: () => ({
    add: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { applyAction } from '../../src/commands/apply.js';
import { registerTrip } from '../../src/data/registry.js';
import { writeProposal } from '../../src/data/proposals.js';
import type { Plan, Proposal } from '../../src/data/plan-schema.js';

describe('apply command', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  const tripDir = path.join(testDir, 'japan');

  const basePlan: Plan = {
    version_id: 'v_001', parent_version_id: null,
    created_at: '2026-04-01T00:00:00Z', created_by: 'test',
    score: { composite: 80, components: {} },
    days: [{ day_index: 1, date: '2027-05-28', city: 'Tokyo', hotel: null, transit: null, segments: [], notes: '' }],
  };

  const candidatePlan: Plan = {
    ...basePlan,
    version_id: 'v_002', parent_version_id: 'v_001',
    score: { composite: 83, components: {} },
  };

  beforeEach(() => {
    fs.mkdirSync(tripDir, { recursive: true });
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    registerTrip('japan', tripDir, 'Japan');
    fs.writeFileSync(path.join(tripDir, 'plan.json'), JSON.stringify(basePlan));
    fs.writeFileSync(path.join(tripDir, 'constraints.yaml'), 'trip:\n  name: Japan\n  total_days: 1\n  start_date: 2027-05-28\n  end_date: 2027-05-28');
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('promotes candidate plan to plan.json', async () => {
    const proposal: Proposal = {
      proposal_id: 'prop_123_test', trip_id: 'japan', base_version_id: 'v_001',
      status: 'pending', requested_by: 'michael', requested_at: '2026-04-01T00:00:00Z',
      request_language: 'en', raw_request: 'test', intent: 'direct_override',
      scope: {}, candidate_plan: candidatePlan, impact_summary: {
        changed_segments: [], score_before: 80, score_after: 83, score_delta: 3, tradeoffs: '',
      },
      explanation: { en: 'test change' },
    };
    writeProposal(tripDir, proposal);

    await applyAction({ trip: 'japan', proposal: 'prop_123_test', json: true });
    const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(output.ok).toBe(true);

    const updatedPlan = JSON.parse(fs.readFileSync(path.join(tripDir, 'plan.json'), 'utf-8'));
    expect(updatedPlan.version_id).toBe('v_002');
  });

  it('rejects when base version conflicts', async () => {
    // Advance plan past base version
    const advancedPlan = { ...basePlan, version_id: 'v_005' };
    fs.writeFileSync(path.join(tripDir, 'plan.json'), JSON.stringify(advancedPlan));

    const proposal: Proposal = {
      proposal_id: 'prop_conflict', trip_id: 'japan', base_version_id: 'v_001',
      status: 'pending', requested_by: 'michael', requested_at: '2026-04-01T00:00:00Z',
      request_language: 'en', raw_request: 'test', intent: 'direct_override',
      scope: {}, candidate_plan: candidatePlan, impact_summary: null, explanation: {},
    };
    writeProposal(tripDir, proposal);

    await applyAction({ trip: 'japan', proposal: 'prop_conflict', json: true });
    const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(output.ok).toBe(false);
    expect(output.error.code).toBe('PROPOSAL_CONFLICT');
  });

  it('is idempotent for already-applied proposals', async () => {
    const proposal: Proposal = {
      proposal_id: 'prop_applied', trip_id: 'japan', base_version_id: 'v_001',
      status: 'applied', requested_by: 'michael', requested_at: '2026-04-01T00:00:00Z',
      request_language: 'en', raw_request: 'test', intent: 'direct_override',
      scope: {}, candidate_plan: candidatePlan, impact_summary: null, explanation: {},
    };
    writeProposal(tripDir, proposal);

    await applyAction({ trip: 'japan', proposal: 'prop_applied', json: true });
    const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(output.ok).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commands/apply.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/commands/apply.ts
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { simpleGit } from 'simple-git';
import { resolveTrip } from '../data/registry.js';
import { readProposal, updateProposalStatus } from '../data/proposals.js';
import { renderPlanMarkdown } from '../data/plan-renderer.js';
import { success, error } from '../cli-utils/json-output.js';
import type { Plan, TripConstraints } from '../data/plan-schema.js';

interface ApplyOptions {
  trip?: string;
  proposal: string;
  approvedBy?: string;
  json?: boolean;
}

export async function applyAction(options: ApplyOptions): Promise<void> {
  let resolved;
  try {
    resolved = resolveTrip(options.trip);
  } catch (err: any) {
    if (options.json) { error('apply', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n`)); }
    return;
  }

  let proposal;
  try {
    proposal = readProposal(resolved.tripDir, options.proposal);
  } catch (err: any) {
    if (options.json) { error('apply', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n  ${err.hint}\n`)); }
    return;
  }

  // Idempotent: already applied
  if (proposal.status === 'applied') {
    if (options.json) {
      success('apply', resolved.tripId, { status: 'already_applied', proposal_id: proposal.proposal_id });
    } else {
      console.log(chalk.yellow(`\n  Proposal ${proposal.proposal_id} was already applied.\n`));
    }
    return;
  }

  // Conflict check
  const planPath = path.join(resolved.tripDir, 'plan.json');
  const currentPlan: Plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));

  if (currentPlan.version_id !== proposal.base_version_id) {
    if (options.json) {
      error('apply', 'PROPOSAL_CONFLICT');
    } else {
      console.log(chalk.red(`\n  Conflict: plan is at ${currentPlan.version_id}, proposal was based on ${proposal.base_version_id}\n`));
    }
    return;
  }

  if (!proposal.candidate_plan) {
    if (options.json) {
      error('apply', 'PROPOSAL_NOT_FOUND');
    } else {
      console.log(chalk.red('\n  Proposal has no candidate plan.\n'));
    }
    return;
  }

  // Apply: write plan.json
  fs.writeFileSync(planPath, JSON.stringify(proposal.candidate_plan, null, 2));

  // Render plan.md
  const constraintsPath = path.join(resolved.tripDir, 'constraints.yaml');
  let tripName = resolved.tripId;
  let totalDays = proposal.candidate_plan.days.length;
  let startDate = proposal.candidate_plan.days[0]?.date || '';
  let endDate = proposal.candidate_plan.days[proposal.candidate_plan.days.length - 1]?.date || '';

  if (fs.existsSync(constraintsPath)) {
    const constraints = yaml.load(fs.readFileSync(constraintsPath, 'utf-8')) as any;
    tripName = constraints?.trip?.name || tripName;
    totalDays = constraints?.trip?.total_days || totalDays;
    startDate = constraints?.trip?.start_date || startDate;
    endDate = constraints?.trip?.end_date || endDate;
  }

  const md = renderPlanMarkdown(proposal.candidate_plan, tripName, totalDays, startDate, endDate);
  fs.writeFileSync(path.join(resolved.tripDir, 'plan.md'), md);

  // Update proposal status
  updateProposalStatus(resolved.tripDir, proposal.proposal_id, 'applied');

  // Git commit
  try {
    const git = simpleGit(resolved.tripDir);
    await git.add(['plan.json', 'plan.md', `proposals/${proposal.proposal_id}.json`]);
    await git.commit(`apply: ${proposal.raw_request} (${proposal.proposal_id})`);
  } catch {
    // Non-fatal: git may not be initialized
  }

  const result = {
    status: 'applied',
    proposal_id: proposal.proposal_id,
    new_version_id: proposal.candidate_plan.version_id,
    approved_by: options.approvedBy || null,
    impact_summary: proposal.impact_summary,
    announcement: proposal.explanation,
  };

  if (options.json) {
    success('apply', resolved.tripId, result);
  } else {
    console.log(chalk.green(`\n  Applied: ${proposal.raw_request}`));
    if (proposal.impact_summary) {
      const delta = proposal.impact_summary.score_delta;
      console.log(`  Score: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`);
    }
    console.log();
  }
}
```

**Step 4: Register in `src/cli.ts`**

```typescript
import { applyAction } from './commands/apply.js';

program
  .command('apply')
  .description('Apply a pending proposal')
  .option('--trip <id>', 'Trip ID')
  .requiredOption('--proposal <id>', 'Proposal ID')
  .option('--approved-by <name>', 'Who approved')
  .option('--json', 'JSON output')
  .action((options) => applyAction(options));
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/commands/apply.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/commands/apply.ts src/cli.ts tests/commands/apply.test.ts
git commit -m "feat: add apply command with conflict detection and idempotency"
```

---

### Task 9: Reject Command (`src/commands/reject.ts`)

**Files:**
- Create: `src/commands/reject.ts`
- Modify: `src/cli.ts` — register `reject` command

**Step 1: Write the implementation** (simple command, mirrors apply's resolution pattern)

```typescript
// src/commands/reject.ts
import chalk from 'chalk';
import { resolveTrip } from '../data/registry.js';
import { readProposal, updateProposalStatus } from '../data/proposals.js';
import { success, error } from '../cli-utils/json-output.js';

interface RejectOptions {
  trip?: string;
  proposal: string;
  json?: boolean;
}

export function rejectAction(options: RejectOptions): void {
  let resolved;
  try {
    resolved = resolveTrip(options.trip);
  } catch (err: any) {
    if (options.json) { error('reject', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n`)); }
    return;
  }

  let proposal;
  try {
    proposal = readProposal(resolved.tripDir, options.proposal);
  } catch (err: any) {
    if (options.json) { error('reject', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n  ${err.hint}\n`)); }
    return;
  }

  // Idempotent
  if (proposal.status === 'rejected') {
    if (options.json) {
      success('reject', resolved.tripId, { status: 'already_rejected', proposal_id: proposal.proposal_id });
    } else {
      console.log(chalk.yellow(`\n  Proposal ${proposal.proposal_id} was already rejected.\n`));
    }
    return;
  }

  updateProposalStatus(resolved.tripDir, proposal.proposal_id, 'rejected');

  if (options.json) {
    success('reject', resolved.tripId, { status: 'rejected', proposal_id: proposal.proposal_id });
  } else {
    console.log(chalk.green(`\n  Rejected: ${proposal.proposal_id}\n`));
  }
}
```

**Step 2: Register in `src/cli.ts`**

```typescript
import { rejectAction } from './commands/reject.js';

program
  .command('reject')
  .description('Reject a pending proposal')
  .option('--trip <id>', 'Trip ID')
  .requiredOption('--proposal <id>', 'Proposal ID')
  .option('--json', 'JSON output')
  .action((options) => rejectAction(options));
```

**Step 3: Commit**

```bash
git add src/commands/reject.ts src/cli.ts
git commit -m "feat: add reject command"
```

---

### Task 10: Ask Command (`src/commands/ask.ts`)

**Files:**
- Create: `src/commands/ask.ts`
- Modify: `src/cli.ts` — register `ask` command

**Step 1: Write the implementation**

```typescript
// src/commands/ask.ts
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { resolveTrip } from '../data/registry.js';
import { success, error, stderrLog } from '../cli-utils/json-output.js';
import { createProvider } from '../llm/factory.js';
import { loadConfig } from '../data/config.js';
import { parseJsonResponse } from '../llm/json-parser.js';
import type { Plan } from '../data/plan-schema.js';

interface AskOptions {
  trip?: string;
  question: string;
  lang?: string;
  json?: boolean;
}

export async function askAction(options: AskOptions): Promise<void> {
  let resolved;
  try {
    resolved = resolveTrip(options.trip);
  } catch (err: any) {
    if (options.json) { error('ask', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n  ${err.hint}\n`)); }
    return;
  }

  const planPath = path.join(resolved.tripDir, 'plan.json');
  if (!fs.existsSync(planPath)) {
    if (options.json) { error('ask', 'NO_PLAN'); } else { console.log(chalk.red('\n  No plan.json found.\n')); }
    return;
  }

  const plan: Plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
  const lang = options.lang || 'en';

  const langInstruction = lang === 'zh'
    ? '\n\nRespond entirely in Simplified Chinese (中文).'
    : '\n\nRespond in English.';

  const prompt = `You are a travel assistant answering questions about a trip plan.
Answer ONLY from the plan data below — do not invent activities or restaurants not in the plan.
Reference specific days and segment IDs in your answer.
Keep answers concise and conversational — this is going into a family chat.

## Plan
${JSON.stringify(plan, null, 2)}

## Question
${options.question}

## Response Format
Return a JSON object:
{
  "answer": "your conversational answer",
  "referenced_days": [1, 3],
  "referenced_segments": ["seg_001", "seg_012"]
}${langInstruction}`;

  if (options.json) stderrLog('Thinking...');

  let response;
  try {
    const config = loadConfig();
    const provider = createProvider(config);
    response = await provider.complete(prompt, 4000);
  } catch (err: any) {
    if (options.json) { error('ask', 'LLM_ERROR'); } else { console.log(chalk.red(`\n  LLM error: ${err.message}\n`)); }
    return;
  }

  try {
    const parsed = parseJsonResponse(response);
    if (options.json) {
      success('ask', resolved.tripId, { ...parsed, language: lang });
    } else {
      console.log(`\n  ${parsed.answer}\n`);
    }
  } catch {
    // Fallback: treat raw response as the answer
    if (options.json) {
      success('ask', resolved.tripId, { answer: response, referenced_days: [], referenced_segments: [], language: lang });
    } else {
      console.log(`\n  ${response}\n`);
    }
  }
}
```

**Step 2: Register in `src/cli.ts`**

```typescript
import { askAction } from './commands/ask.js';

program
  .command('ask')
  .description('Ask a question about the trip plan')
  .option('--trip <id>', 'Trip ID')
  .requiredOption('--question <q>', 'Question to ask')
  .option('--lang <code>', 'Response language (en|zh)')
  .option('--json', 'JSON output')
  .action((options) => askAction(options));
```

**Step 3: Commit**

```bash
git add src/commands/ask.ts src/cli.ts
git commit -m "feat: add ask command — NL query against plan"
```

---

### Task 11: Propose Command (`src/commands/propose.ts`)

**Files:**
- Create: `src/commands/propose.ts`
- Modify: `src/cli.ts` — register `propose` command

**Step 1: Write the implementation**

```typescript
// src/commands/propose.ts
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { resolveTrip } from '../data/registry.js';
import { writeProposal } from '../data/proposals.js';
import { success, error, stderrLog } from '../cli-utils/json-output.js';
import { createProvider } from '../llm/factory.js';
import { loadConfig } from '../data/config.js';
import { parseJsonResponse } from '../llm/json-parser.js';
import { Scorer } from '../scoring/scorer.js';
import { createProposalId } from '../data/plan-schema.js';
import type { Plan, Proposal, TripConstraints, Rubrics, ActivitiesDB } from '../data/plan-schema.js';

interface ProposeOptions {
  trip?: string;
  request: string;
  requestedBy?: string;
  lang?: string;
  json?: boolean;
}

export async function proposeAction(options: ProposeOptions): Promise<void> {
  let resolved;
  try {
    resolved = resolveTrip(options.trip);
  } catch (err: any) {
    if (options.json) { error('propose', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n`)); }
    return;
  }

  const planPath = path.join(resolved.tripDir, 'plan.json');
  if (!fs.existsSync(planPath)) {
    if (options.json) { error('propose', 'NO_PLAN'); } else { console.log(chalk.red('\n  No plan.json found.\n')); }
    return;
  }

  const currentPlan: Plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
  const lang = options.lang || 'en';

  // Load trip context
  const constraintsPath = path.join(resolved.tripDir, 'constraints.yaml');
  const rubricsPath = path.join(resolved.tripDir, 'rubrics.yaml');
  const dbPath = path.join(resolved.tripDir, 'activities_db.json');

  const constraints = fs.existsSync(constraintsPath)
    ? yaml.load(fs.readFileSync(constraintsPath, 'utf-8')) as TripConstraints
    : null;
  const rubrics = fs.existsSync(rubricsPath)
    ? yaml.load(fs.readFileSync(rubricsPath, 'utf-8')) as Rubrics
    : null;
  const activitiesDb = fs.existsSync(dbPath)
    ? JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as ActivitiesDB
    : {};

  const langInstruction = lang === 'zh'
    ? '\nWrite the explanation fields in Simplified Chinese.'
    : '\nWrite the explanation fields in English.';

  const prompt = `You are a travel plan editor. A user has requested a change to their trip plan.

## Current Plan
${JSON.stringify(currentPlan, null, 2)}

${constraints ? `## Constraints\n${yaml.dump(constraints)}` : ''}

${Object.keys(activitiesDb).length > 0 ? `## Activities Database\n${JSON.stringify(activitiesDb, null, 2)}` : ''}

## User Request
"${options.request}"
${options.requestedBy ? `Requested by: ${options.requestedBy}` : ''}

## Instructions
1. Classify the intent as one of: "direct_override", "scoped_reoptimize", "structural_change"
2. Identify which day(s) and segment(s) are affected (the scope)
3. If the request is ambiguous (e.g. "change the restaurant" but there are many), return needs_clarification
4. Otherwise, generate a modified plan with the change applied
5. Explain the change and any tradeoffs

## Response Format
Return a JSON object:
{
  "intent": "direct_override|scoped_reoptimize|structural_change",
  "needs_clarification": false,
  "clarification": null,
  "scope": { "day_index": 3, "segment_id": "seg_012", "period": "lunch" },
  "candidate_plan": { ... the full modified Plan object ... },
  "tradeoffs": "description of tradeoffs",
  "explanation_en": "English explanation of what changed and why",
  "explanation_zh": "Chinese explanation"
}

If needs_clarification is true, omit candidate_plan and include:
{
  "needs_clarification": true,
  "clarification": {
    "question": "Which lunch?",
    "options": [{ "day_index": 3, "segment_id": "seg_012", "title": "Noodle Shop" }]
  }
}

IMPORTANT: The candidate_plan must be a complete Plan object with all days and segments, not just the changed parts. Preserve version_id as "${currentPlan.version_id}" — it will be incremented on apply.${langInstruction}`;

  if (options.json) stderrLog('Generating proposal...');
  else process.stdout.write(chalk.dim('  Generating proposal...'));

  let response;
  try {
    const config = loadConfig();
    const provider = createProvider(config);
    response = await provider.complete(prompt, 32000);
  } catch (err: any) {
    if (options.json) { error('propose', 'LLM_ERROR'); } else { console.log(chalk.red(`\n  LLM error: ${err.message}\n`)); }
    return;
  }

  let parsed;
  try {
    parsed = parseJsonResponse(response);
  } catch {
    if (options.json) { error('propose', 'LLM_ERROR'); } else { console.log(chalk.red('\n  Failed to parse LLM response.\n')); }
    return;
  }

  const proposalId = createProposalId(options.request);

  // Handle clarification
  if (parsed.needs_clarification) {
    const proposal: Proposal = {
      proposal_id: proposalId,
      trip_id: resolved.tripId,
      base_version_id: currentPlan.version_id,
      status: 'needs_clarification',
      requested_by: options.requestedBy || '',
      requested_at: new Date().toISOString(),
      request_language: lang,
      raw_request: options.request,
      intent: parsed.intent || 'scoped_reoptimize',
      scope: parsed.scope || {},
      candidate_plan: null,
      impact_summary: null,
      explanation: {},
      clarification: parsed.clarification,
    };
    writeProposal(resolved.tripDir, proposal);
    if (options.json) {
      success('propose', resolved.tripId, proposal);
    } else {
      console.log(`\n  ${parsed.clarification.question}\n`);
    }
    return;
  }

  // Build candidate plan with bumped version
  const candidatePlan = parsed.candidate_plan as Plan;
  const versionNum = parseInt(currentPlan.version_id.replace('v_', ''), 10) || 0;
  candidatePlan.version_id = `v_${String(versionNum + 1).padStart(3, '0')}`;
  candidatePlan.parent_version_id = currentPlan.version_id;
  candidatePlan.created_at = new Date().toISOString();
  candidatePlan.created_by = options.requestedBy || 'propose';

  // Score the candidate
  let scoreBefore = currentPlan.score.composite;
  let scoreAfter = scoreBefore;
  if (rubrics && constraints) {
    try {
      const config = loadConfig();
      const provider = createProvider(config);
      const scorer = new Scorer(provider);
      const planContent = JSON.stringify(candidatePlan, null, 2);
      const result = await scorer.scoreAbsolute(planContent, activitiesDb, constraints, rubrics, stderrLog);
      scoreAfter = result.composite_score;
      candidatePlan.score = { composite: scoreAfter, components: result.components };
    } catch {
      // Scoring failed — proceed without score
    }
  }

  const proposal: Proposal = {
    proposal_id: proposalId,
    trip_id: resolved.tripId,
    base_version_id: currentPlan.version_id,
    status: 'pending',
    requested_by: options.requestedBy || '',
    requested_at: new Date().toISOString(),
    request_language: lang,
    raw_request: options.request,
    intent: parsed.intent || 'scoped_reoptimize',
    scope: parsed.scope || {},
    candidate_plan: candidatePlan,
    impact_summary: {
      changed_segments: [],
      score_before: scoreBefore,
      score_after: scoreAfter,
      score_delta: scoreAfter - scoreBefore,
      tradeoffs: parsed.tradeoffs || '',
    },
    explanation: {
      en: parsed.explanation_en || '',
      zh: parsed.explanation_zh || '',
    },
  };

  writeProposal(resolved.tripDir, proposal);

  if (options.json) {
    success('propose', resolved.tripId, proposal);
  } else {
    console.log(chalk.green(`\n  Proposal created: ${proposalId}`));
    console.log(`  ${parsed.explanation_en || parsed.tradeoffs}`);
    const delta = scoreAfter - scoreBefore;
    if (delta !== 0) console.log(`  Score: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`);
    console.log(chalk.dim(`\n  To apply: trip-optimizer apply --proposal ${proposalId}\n`));
  }
}
```

**Step 2: Register in `src/cli.ts`**

```typescript
import { proposeAction } from './commands/propose.js';

program
  .command('propose')
  .description('Propose a change to the trip plan')
  .option('--trip <id>', 'Trip ID')
  .requiredOption('--request <text>', 'Change request in natural language')
  .option('--requested-by <name>', 'Who requested the change')
  .option('--lang <code>', 'Language (en|zh)')
  .option('--json', 'JSON output')
  .action((options) => proposeAction(options));
```

**Step 3: Commit**

```bash
git add src/commands/propose.ts src/cli.ts
git commit -m "feat: add propose command — intent classification, candidate generation, scoring"
```

---

### Task 12: Reoptimize Command (`src/commands/reoptimize.ts`)

**Files:**
- Create: `src/commands/reoptimize.ts`
- Modify: `src/cli.ts` — register `reoptimize` command

This is structurally similar to `propose` but driven by a goal + scope instead of a change request. Follow the same pattern as Task 11 but with a scope-parsing prompt and `--scope`/`--goal` flags instead of `--request`.

**Step 1: Write the implementation**

The implementation mirrors `proposeAction` with these differences:
- Accepts `--scope "day:4"` and `--goal "slower pace"` instead of `--request`
- Parses scope syntax (`day:N`, `city:name`, `period:name`, `segment:id`)
- LLM prompt focuses on optimization within scope rather than applying a specific change
- Proposal `intent` is always `scoped_reoptimize`

```typescript
// src/commands/reoptimize.ts
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { resolveTrip } from '../data/registry.js';
import { writeProposal } from '../data/proposals.js';
import { success, error, stderrLog } from '../cli-utils/json-output.js';
import { createProvider } from '../llm/factory.js';
import { loadConfig } from '../data/config.js';
import { parseJsonResponse } from '../llm/json-parser.js';
import { Scorer } from '../scoring/scorer.js';
import { createProposalId } from '../data/plan-schema.js';
import type { Plan, Proposal, ProposalScope, TripConstraints, Rubrics, ActivitiesDB } from '../data/plan-schema.js';

interface ReoptimizeOptions {
  trip?: string;
  scope: string;
  goal: string;
  lang?: string;
  json?: boolean;
}

function parseScope(scopeStr: string): ProposalScope {
  const [key, value] = scopeStr.split(':');
  switch (key) {
    case 'day': return { day_index: parseInt(value, 10) };
    case 'city': return {}; // city filtering done in prompt
    case 'period': return { period: value as any };
    case 'segment': return { segment_id: value };
    default: return {};
  }
}

export async function reoptimizeAction(options: ReoptimizeOptions): Promise<void> {
  let resolved;
  try {
    resolved = resolveTrip(options.trip);
  } catch (err: any) {
    if (options.json) { error('reoptimize', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n`)); }
    return;
  }

  const planPath = path.join(resolved.tripDir, 'plan.json');
  if (!fs.existsSync(planPath)) {
    if (options.json) { error('reoptimize', 'NO_PLAN'); } else { console.log(chalk.red('\n  No plan.json found.\n')); }
    return;
  }

  const currentPlan: Plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
  const scope = parseScope(options.scope);
  const lang = options.lang || 'en';

  const constraintsPath = path.join(resolved.tripDir, 'constraints.yaml');
  const rubricsPath = path.join(resolved.tripDir, 'rubrics.yaml');
  const dbPath = path.join(resolved.tripDir, 'activities_db.json');

  const constraints = fs.existsSync(constraintsPath)
    ? yaml.load(fs.readFileSync(constraintsPath, 'utf-8')) as TripConstraints : null;
  const rubrics = fs.existsSync(rubricsPath)
    ? yaml.load(fs.readFileSync(rubricsPath, 'utf-8')) as Rubrics : null;
  const activitiesDb = fs.existsSync(dbPath)
    ? JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as ActivitiesDB : {};

  const prompt = `You are a travel plan optimizer. Improve the plan within the specified scope.

## Current Plan
${JSON.stringify(currentPlan, null, 2)}

## Optimization Scope
${options.scope}

## Goal
${options.goal}

${Object.keys(activitiesDb).length > 0 ? `## Available Alternatives\n${JSON.stringify(activitiesDb, null, 2)}` : ''}

## Instructions
- Only modify segments within the specified scope
- Keep all other days/segments unchanged
- Optimize toward the stated goal
- Return the complete modified plan

## Response Format
{
  "candidate_plan": { ... full Plan object ... },
  "tradeoffs": "what improved and what was traded off",
  "explanation_en": "English explanation",
  "explanation_zh": "Chinese explanation"
}`;

  if (options.json) stderrLog('Optimizing...');

  let response;
  try {
    const config = loadConfig();
    const provider = createProvider(config);
    response = await provider.complete(prompt, 32000);
  } catch (err: any) {
    if (options.json) { error('reoptimize', 'LLM_ERROR'); } else { console.log(chalk.red(`\n  ${err.message}\n`)); }
    return;
  }

  let parsed;
  try { parsed = parseJsonResponse(response); } catch {
    if (options.json) { error('reoptimize', 'LLM_ERROR'); } else { console.log(chalk.red('\n  Failed to parse response.\n')); }
    return;
  }

  const candidatePlan = parsed.candidate_plan as Plan;
  const versionNum = parseInt(currentPlan.version_id.replace('v_', ''), 10) || 0;
  candidatePlan.version_id = `v_${String(versionNum + 1).padStart(3, '0')}`;
  candidatePlan.parent_version_id = currentPlan.version_id;
  candidatePlan.created_at = new Date().toISOString();
  candidatePlan.created_by = 'reoptimize';

  let scoreBefore = currentPlan.score.composite;
  let scoreAfter = scoreBefore;
  if (rubrics && constraints) {
    try {
      const config = loadConfig();
      const provider = createProvider(config);
      const scorer = new Scorer(provider);
      const result = await scorer.scoreAbsolute(JSON.stringify(candidatePlan), activitiesDb, constraints, rubrics, stderrLog);
      scoreAfter = result.composite_score;
      candidatePlan.score = { composite: scoreAfter, components: result.components };
    } catch {}
  }

  const proposalId = createProposalId(options.goal);
  const proposal: Proposal = {
    proposal_id: proposalId, trip_id: resolved.tripId, base_version_id: currentPlan.version_id,
    status: 'pending', requested_by: 'reoptimize', requested_at: new Date().toISOString(),
    request_language: lang, raw_request: `reoptimize ${options.scope}: ${options.goal}`,
    intent: 'scoped_reoptimize', scope, candidate_plan: candidatePlan,
    impact_summary: { changed_segments: [], score_before: scoreBefore, score_after: scoreAfter, score_delta: scoreAfter - scoreBefore, tradeoffs: parsed.tradeoffs || '' },
    explanation: { en: parsed.explanation_en || '', zh: parsed.explanation_zh || '' },
  };
  writeProposal(resolved.tripDir, proposal);

  if (options.json) {
    success('reoptimize', resolved.tripId, proposal);
  } else {
    console.log(chalk.green(`\n  Reoptimize proposal: ${proposalId}`));
    console.log(`  ${parsed.explanation_en || parsed.tradeoffs}`);
    console.log(chalk.dim(`\n  To apply: trip-optimizer apply --proposal ${proposalId}\n`));
  }
}
```

**Step 2: Register in `src/cli.ts`**

```typescript
import { reoptimizeAction } from './commands/reoptimize.js';

program
  .command('reoptimize')
  .description('Scoped optimization pass')
  .option('--trip <id>', 'Trip ID')
  .requiredOption('--scope <scope>', 'Scope (day:N, city:name, period:name, segment:id)')
  .requiredOption('--goal <goal>', 'Optimization goal')
  .option('--lang <code>', 'Language (en|zh)')
  .option('--json', 'JSON output')
  .action((options) => reoptimizeAction(options));
```

**Step 3: Commit**

```bash
git add src/commands/reoptimize.ts src/cli.ts
git commit -m "feat: add reoptimize command — scoped optimization producing proposals"
```

---

### Task 13: Migrate Command (`src/commands/migrate.ts`)

**Files:**
- Create: `src/commands/migrate.ts`
- Modify: `src/cli.ts` — register `migrate` command

**Step 1: Write the implementation**

```typescript
// src/commands/migrate.ts
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { simpleGit } from 'simple-git';
import { registerTrip } from '../data/registry.js';
import { renderPlanMarkdown } from '../data/plan-renderer.js';
import { success, error, stderrLog } from '../cli-utils/json-output.js';
import { createProvider } from '../llm/factory.js';
import { loadConfig } from '../data/config.js';
import { parseJsonResponse } from '../llm/json-parser.js';
import type { Plan, TripConstraints } from '../data/plan-schema.js';

interface MigrateOptions {
  id?: string;
  dryRun?: boolean;
  json?: boolean;
  verbose?: boolean;
}

export async function migrateAction(tripPath: string, options: MigrateOptions): Promise<void> {
  const absPath = path.resolve(tripPath);
  const constraintsPath = path.join(absPath, 'constraints.yaml');
  const planMdPath = path.join(absPath, 'plan.md');

  // Validate
  if (!fs.existsSync(constraintsPath) || !fs.existsSync(planMdPath)) {
    if (options.json) { error('migrate', 'MIGRATION_FAILED'); } else {
      console.log(chalk.red('\n  Directory must contain constraints.yaml and plan.md\n'));
    }
    return;
  }

  const tripId = options.id || path.basename(absPath);
  const constraints = yaml.load(fs.readFileSync(constraintsPath, 'utf-8')) as TripConstraints;
  const planMd = fs.readFileSync(planMdPath, 'utf-8');

  const log = options.verbose ? stderrLog : () => {};

  // Parse plan.md into plan.json via LLM
  log('Parsing plan.md into structured format...');

  const prompt = `Convert this travel plan from Markdown into a structured JSON format.

## Markdown Plan
${planMd}

## Constraints (for reference)
${yaml.dump(constraints)}

## Target JSON Schema
{
  "version_id": "v_001",
  "parent_version_id": null,
  "created_at": "${new Date().toISOString()}",
  "created_by": "migrate",
  "score": { "composite": 0, "components": {} },
  "days": [
    {
      "day_index": 1,
      "date": "YYYY-MM-DD",
      "city": "City Name",
      "hotel": "Hotel Name or null",
      "transit": { "mode": "flight|train|bus", "detail": "details" } or null,
      "segments": [
        {
          "id": "seg_001",
          "type": "activity|meal|transit|free_time",
          "period": "morning|lunch|afternoon|dinner|evening",
          "title": "Activity Name",
          "details": "Description",
          "location": "Location",
          "start_time": "HH:MM",
          "end_time": "HH:MM",
          "tags": ["tag1"]
        }
      ],
      "notes": ""
    }
  ]
}

IMPORTANT:
- Extract ALL days from the plan
- Generate unique segment IDs (seg_001, seg_002, etc.)
- Use dates from the plan or constraints
- Classify each segment with the correct type and period
- Return ONLY the JSON object, no markdown wrapping`;

  let plan: Plan;
  try {
    const config = loadConfig();
    const provider = createProvider(config);
    const response = await provider.complete(prompt, 32000);
    plan = parseJsonResponse(response) as Plan;
  } catch (err: any) {
    if (options.json) { error('migrate', 'MIGRATION_FAILED'); } else {
      console.log(chalk.red(`\n  Failed to parse plan: ${err.message}\n`));
    }
    return;
  }

  // Validate
  if (!plan.days || plan.days.length === 0) {
    if (options.json) { error('migrate', 'MIGRATION_FAILED'); } else {
      console.log(chalk.red('\n  Parsed plan has no days.\n'));
    }
    return;
  }

  log(`Parsed ${plan.days.length} days`);

  if (options.dryRun) {
    if (options.json) {
      success('migrate', tripId, { plan, dry_run: true });
    } else {
      console.log(JSON.stringify(plan, null, 2));
    }
    return;
  }

  // Write plan.json
  fs.writeFileSync(path.join(absPath, 'plan.json'), JSON.stringify(plan, null, 2));

  // Create proposals/ directory
  fs.mkdirSync(path.join(absPath, 'proposals'), { recursive: true });

  // Render plan.rendered.md for comparison
  const tripName = constraints?.trip?.name || tripId;
  const totalDays = constraints?.trip?.total_days || plan.days.length;
  const startDate = constraints?.trip?.start_date || plan.days[0]?.date || '';
  const endDate = constraints?.trip?.end_date || plan.days[plan.days.length - 1]?.date || '';
  const renderedMd = renderPlanMarkdown(plan, tripName, totalDays, startDate, endDate);
  fs.writeFileSync(path.join(absPath, 'plan.rendered.md'), renderedMd);

  // Register
  try {
    registerTrip(tripId, absPath, tripName);
  } catch (err: any) {
    if (options.json) { error('migrate', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n  ${err.hint}\n`)); }
    return;
  }

  // Git commit
  try {
    const git = simpleGit(absPath);
    await git.add(['plan.json', 'proposals', 'plan.rendered.md']);
    await git.commit('chore: migrate to structured plan format');
  } catch {
    // Non-fatal
  }

  if (options.json) {
    success('migrate', tripId, { trip_id: tripId, days: plan.days.length });
  } else {
    console.log(chalk.green(`\n  Migrated: ${tripId} (${plan.days.length} days)`));
    console.log(chalk.dim('  Compare: diff plan.md plan.rendered.md'));
    console.log(chalk.dim('  If satisfied: mv plan.rendered.md plan.md\n'));
  }
}
```

**Step 2: Register in `src/cli.ts`**

```typescript
import { migrateAction } from './commands/migrate.js';

program
  .command('migrate <path>')
  .description('Migrate existing trip to structured format')
  .option('--id <id>', 'Custom trip ID')
  .option('--dry-run', 'Parse only, do not write')
  .option('--json', 'JSON output')
  .option('--verbose', 'Show progress')
  .action((tripPath, options) => migrateAction(tripPath, options));
```

**Step 3: Commit**

```bash
git add src/commands/migrate.ts src/cli.ts
git commit -m "feat: add migrate command — LLM-assisted plan.md to plan.json conversion"
```

---

### Task 14: Update Init Command to Register Trips

**Files:**
- Modify: `src/commands/init.ts:525-539` — add registry registration after scaffold
- Modify: `src/data/trip.ts` — add `proposals/` to scaffold

**Step 1: Update `src/data/trip.ts`**

Add `proposals/` directory creation in `scaffoldTrip`:

After `fs.writeFileSync(path.join(tripDir, '.gitignore'), GITIGNORE);` add:
```typescript
fs.mkdirSync(path.join(tripDir, 'proposals'), { recursive: true });
```

**Step 2: Update `src/commands/init.ts`**

After the `scaffoldTrip` call (around line 535), add:

```typescript
import { registerTrip } from '../data/registry.js';
```

After `spinner.succeed(...)` for project creation, add:

```typescript
  // Register in global trip registry
  try {
    registerTrip(tripDirName, tripDir, constraints.trip.name);
  } catch {
    // Non-fatal: registry registration can be done manually with migrate
  }
```

**Step 3: Update scaffold test**

Add to `tests/data/trip.test.ts`:

```typescript
it('creates proposals directory', async () => {
  const tripDir = path.join(testDir, 'japan-2027');
  await scaffoldTrip(tripDir, {
    constraints: 'trip:\n  name: test',
    rubrics: 'dimensions: {}',
    plan: '# Day 1',
    program: '# Instructions',
  });
  expect(fs.existsSync(path.join(tripDir, 'proposals'))).toBe(true);
});
```

**Step 4: Run tests**

Run: `npx vitest run tests/data/trip.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/data/trip.ts src/commands/init.ts tests/data/trip.test.ts
git commit -m "feat: register trips on init, add proposals/ to scaffold"
```

---

### Task 15: Update Plan Command with --json Flag

**Files:**
- Modify: `src/commands/plan.ts` — add `--json` flag, read from `plan.json` when available
- Modify: `src/cli.ts` — add `--json` option to plan command

**Step 1: Update `src/commands/plan.ts`**

At the top of `planCommand`, before the existing PDF logic, add:

```typescript
// Try plan.json first for --json output
if (options.json) {
  const planJsonPath = path.join(cwd, 'plan.json');
  if (fs.existsSync(planJsonPath)) {
    const plan = JSON.parse(fs.readFileSync(planJsonPath, 'utf-8'));
    const { success } = await import('../cli-utils/json-output.js');
    success('plan', null, plan);
    return;
  }
  // Fallback to plan.md content
  const { success } = await import('../cli-utils/json-output.js');
  success('plan', null, { markdown: content });
  return;
}
```

Add `json?: boolean` to `PlanOptions` interface.

**Step 2: Update `src/cli.ts`**

Add `--json` to the plan command:

```typescript
program
  .command('plan')
  .description('Pretty-print the current travel plan')
  .option('--pdf', 'Generate a PDF document')
  .option('-o, --output <path>', 'Output path for PDF')
  .option('--json', 'JSON output')
  .action(planCommand);
```

**Step 3: Commit**

```bash
git add src/commands/plan.ts src/cli.ts
git commit -m "feat: add --json flag to plan command"
```

---

### Task 16: Run All Tests and Final Verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Build**

Run: `npx tsup`
Expected: Clean build

**Step 3: Verify CLI help**

Run: `node dist/cli.js --help`
Expected: Shows all new commands (trip, ask, propose, apply, reject, proposals, reoptimize, migrate)

Run: `node dist/cli.js trip --help`
Expected: Shows list, show, set-default subcommands

**Step 4: Commit any fixes needed**

```bash
git add -A
git commit -m "fix: resolve build and test issues"
```

---

## Implementation Order Summary

| Task | Component | Depends On |
|------|-----------|------------|
| 1 | Plan Schema Types | — |
| 2 | JSON Output Utilities | — |
| 3 | Trip Registry | 1, 2 |
| 4 | Plan Renderer | 1 |
| 5 | Trip Command | 3, 4 |
| 6 | Proposal File I/O | 1, 2 |
| 7 | Proposals List Command | 3, 6 |
| 8 | Apply Command | 3, 4, 6 |
| 9 | Reject Command | 3, 6 |
| 10 | Ask Command | 3 |
| 11 | Propose Command | 3, 6 |
| 12 | Reoptimize Command | 3, 6 |
| 13 | Migrate Command | 3, 4 |
| 14 | Update Init | 3, 6 |
| 15 | Update Plan --json | 2 |
| 16 | Final Verification | All |

Tasks 1-2 can run in parallel. Tasks 3-4 can run in parallel. Tasks 5-15 depend on foundation layers but many can run in parallel (5, 6 in parallel; then 7-13 in parallel).

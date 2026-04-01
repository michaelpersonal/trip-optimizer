import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerTrip } from '../../src/data/registry.js';
import { writeProposal, readProposal } from '../../src/data/proposals.js';
import { applyAction } from '../../src/commands/apply.js';
import type { Plan, Proposal } from '../../src/data/plan-schema.js';

// Mock simple-git so apply doesn't actually run git
vi.mock('simple-git', () => ({
  default: () => ({
    add: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
  }),
}));

function makePlan(versionId = 'v_001'): Plan {
  return {
    version_id: versionId,
    parent_version_id: null,
    created_at: '2025-06-01T00:00:00Z',
    created_by: 'test',
    score: { composite: 85, components: {} },
    days: [
      {
        day_index: 1,
        date: '2025-06-01',
        city: 'Tokyo',
        hotel: 'Test Hotel',
        transit: null,
        segments: [
          {
            id: 'seg_1',
            type: 'activity' as const,
            period: 'morning' as const,
            title: 'Temple Visit',
            details: 'Visit the temple',
            location: 'Asakusa',
            start_time: '09:00',
            end_time: '12:00',
            tags: [],
          },
        ],
        notes: '',
      },
    ],
  };
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  const candidatePlan = makePlan('v_002');
  candidatePlan.parent_version_id = 'v_001';
  candidatePlan.score.composite = 90;
  candidatePlan.days[0].segments[0].title = 'Upgraded Temple Visit';

  return {
    proposal_id: 'prop_123_test',
    trip_id: 'japan-2025',
    base_version_id: 'v_001',
    status: 'pending',
    requested_by: 'user',
    requested_at: '2025-06-01T00:00:00Z',
    request_language: 'en',
    raw_request: 'upgrade temple visit',
    intent: 'scoped_reoptimize',
    scope: {},
    candidate_plan: candidatePlan,
    impact_summary: {
      changed_segments: ['seg_1'],
      score_before: 85,
      score_after: 90,
      score_delta: 5,
      tradeoffs: [],
    },
    explanation: { en: 'Upgraded the temple visit' },
    ...overrides,
  };
}

describe('apply command', () => {
  const testDir = path.join(os.tmpdir(), 'trip-opt-test-apply-' + Date.now());
  let stdoutData: string;

  beforeEach(() => {
    stdoutData = '';
    fs.mkdirSync(testDir, { recursive: true });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdoutData += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function setupTrip() {
    const tripDir = path.join(testDir, 'trip-japan');
    fs.mkdirSync(tripDir, { recursive: true });
    // Write plan.json
    fs.writeFileSync(path.join(tripDir, 'plan.json'), JSON.stringify(makePlan()));
    // Write constraints.yaml for the renderer
    fs.writeFileSync(
      path.join(tripDir, 'constraints.yaml'),
      'trip_name: Japan Trip\ntotal_days: 1\nstart_date: "2025-06-01"\nend_date: "2025-06-01"\n',
    );
    // Register trip
    registerTrip('japan-2025', tripDir, 'Japan Trip', testDir);
    return tripDir;
  }

  it('promotes candidate plan to plan.json', async () => {
    const tripDir = setupTrip();
    const proposal = makeProposal();
    writeProposal(tripDir, proposal);

    await applyAction({
      trip: 'japan-2025',
      proposal: 'prop_123_test',
      json: true,
      _registryDir: testDir,
    });

    const parsed = JSON.parse(stdoutData);
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe('apply');
    expect(parsed.data.status).toBe('applied');
    expect(parsed.data.proposal_id).toBe('prop_123_test');
    expect(parsed.data.new_version_id).toBe('v_002');

    // Verify plan.json was written with the candidate plan
    const writtenPlan: Plan = JSON.parse(fs.readFileSync(path.join(tripDir, 'plan.json'), 'utf-8'));
    expect(writtenPlan.version_id).toBe('v_002');
    expect(writtenPlan.days[0].segments[0].title).toBe('Upgraded Temple Visit');

    // Verify plan.md was written
    expect(fs.existsSync(path.join(tripDir, 'plan.md'))).toBe(true);

    // Verify proposal status was updated
    const updatedProposal = readProposal(tripDir, 'prop_123_test');
    expect(updatedProposal.status).toBe('applied');
  });

  it('rejects when base version conflicts (PROPOSAL_CONFLICT)', async () => {
    const tripDir = setupTrip();
    // Write plan with v_002 but proposal targets v_001
    const currentPlan = makePlan('v_002');
    fs.writeFileSync(path.join(tripDir, 'plan.json'), JSON.stringify(currentPlan));

    const proposal = makeProposal({ base_version_id: 'v_001' });
    writeProposal(tripDir, proposal);

    await applyAction({
      trip: 'japan-2025',
      proposal: 'prop_123_test',
      json: true,
      _registryDir: testDir,
    });

    const parsed = JSON.parse(stdoutData);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('PROPOSAL_CONFLICT');
  });

  it('is idempotent for already-applied proposals', async () => {
    const tripDir = setupTrip();
    const proposal = makeProposal({ status: 'applied' });
    writeProposal(tripDir, proposal);

    await applyAction({
      trip: 'japan-2025',
      proposal: 'prop_123_test',
      json: true,
      _registryDir: testDir,
    });

    const parsed = JSON.parse(stdoutData);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.status).toBe('already_applied');
  });

  it('errors for missing proposal (PROPOSAL_NOT_FOUND)', async () => {
    setupTrip();

    await applyAction({
      trip: 'japan-2025',
      proposal: 'nonexistent',
      json: true,
      _registryDir: testDir,
    });

    const parsed = JSON.parse(stdoutData);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('PROPOSAL_NOT_FOUND');
  });
});

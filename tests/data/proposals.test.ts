import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  writeProposal,
  readProposal,
  listProposals,
  updateProposalStatus,
} from '../../src/data/proposals.js';
import { CLIError } from '../../src/cli-utils/json-output.js';
import type { Proposal, ProposalStatus } from '../../src/data/plan-schema.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposal_id: 'prop_123_test_proposal',
    trip_id: 'japan-2025',
    base_version_id: 'v_001',
    status: 'pending',
    requested_by: 'agent',
    requested_at: '2025-06-01T00:00:00Z',
    request_language: 'en',
    raw_request: 'swap day 2 lunch',
    intent: 'direct_override',
    scope: { day_index: 2 },
    candidate_plan: null,
    impact_summary: null,
    explanation: { reason: 'user asked' },
    ...overrides,
  };
}

describe('proposals', () => {
  const testDir = path.join(os.tmpdir(), 'trip-opt-test-proposals-' + Date.now());

  beforeEach(() => fs.mkdirSync(testDir, { recursive: true }));
  afterEach(() => fs.rmSync(testDir, { recursive: true, force: true }));

  it('writes and reads a proposal', () => {
    const proposal = makeProposal();
    writeProposal(testDir, proposal);

    const filePath = path.join(testDir, 'proposals', `${proposal.proposal_id}.json`);
    expect(fs.existsSync(filePath)).toBe(true);

    const read = readProposal(testDir, proposal.proposal_id);
    expect(read).toEqual(proposal);
  });

  it('lists proposals (all)', () => {
    const p1 = makeProposal({ proposal_id: 'prop_1_a' });
    const p2 = makeProposal({ proposal_id: 'prop_2_b', status: 'applied' });
    const p3 = makeProposal({ proposal_id: 'prop_3_c', status: 'rejected' });

    writeProposal(testDir, p1);
    writeProposal(testDir, p2);
    writeProposal(testDir, p3);

    const all = listProposals(testDir);
    expect(all).toHaveLength(3);
    const ids = all.map((p) => p.proposal_id).sort();
    expect(ids).toEqual(['prop_1_a', 'prop_2_b', 'prop_3_c']);
  });

  it('filters proposals by status', () => {
    const p1 = makeProposal({ proposal_id: 'prop_1_a', status: 'pending' });
    const p2 = makeProposal({ proposal_id: 'prop_2_b', status: 'applied' });
    const p3 = makeProposal({ proposal_id: 'prop_3_c', status: 'pending' });

    writeProposal(testDir, p1);
    writeProposal(testDir, p2);
    writeProposal(testDir, p3);

    const pending = listProposals(testDir, 'pending');
    expect(pending).toHaveLength(2);
    expect(pending.every((p) => p.status === 'pending')).toBe(true);

    const applied = listProposals(testDir, 'applied');
    expect(applied).toHaveLength(1);
    expect(applied[0].proposal_id).toBe('prop_2_b');
  });

  it('updates proposal status', () => {
    const proposal = makeProposal({ proposal_id: 'prop_update_test' });
    writeProposal(testDir, proposal);

    const updated = updateProposalStatus(testDir, 'prop_update_test', 'applied');
    expect(updated.status).toBe('applied');
    expect(updated.proposal_id).toBe('prop_update_test');

    // Verify persisted
    const reRead = readProposal(testDir, 'prop_update_test');
    expect(reRead.status).toBe('applied');
  });

  it('throws PROPOSAL_NOT_FOUND for nonexistent', () => {
    expect(() => readProposal(testDir, 'nonexistent')).toThrow(CLIError);
    try {
      readProposal(testDir, 'nonexistent');
    } catch (e) {
      expect((e as CLIError).code).toBe('PROPOSAL_NOT_FOUND');
    }
  });

  it('lists empty when no proposals dir', () => {
    const all = listProposals(testDir);
    expect(all).toEqual([]);
  });
});

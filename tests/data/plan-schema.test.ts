import { describe, it, expect } from 'vitest';
import {
  SEGMENT_TYPES,
  PERIODS,
  PROPOSAL_STATUSES,
  INTENT_TYPES,
  createSegmentId,
  createVersionId,
  createProposalId,
} from '../../src/data/plan-schema.js';

describe('plan-schema constants', () => {
  it('SEGMENT_TYPES contains expected values', () => {
    expect(SEGMENT_TYPES).toContain('activity');
    expect(SEGMENT_TYPES).toContain('meal');
    expect(SEGMENT_TYPES).toContain('transit');
    expect(SEGMENT_TYPES).toContain('free_time');
    expect(SEGMENT_TYPES).toContain('hotel');
    expect(SEGMENT_TYPES).toHaveLength(5);
  });

  it('PERIODS contains expected values', () => {
    expect(PERIODS).toContain('morning');
    expect(PERIODS).toContain('lunch');
    expect(PERIODS).toContain('afternoon');
    expect(PERIODS).toContain('dinner');
    expect(PERIODS).toContain('evening');
    expect(PERIODS).toHaveLength(5);
  });

  it('PROPOSAL_STATUSES contains expected values', () => {
    expect(PROPOSAL_STATUSES).toContain('pending');
    expect(PROPOSAL_STATUSES).toContain('applied');
    expect(PROPOSAL_STATUSES).toContain('rejected');
    expect(PROPOSAL_STATUSES).toContain('needs_clarification');
    expect(PROPOSAL_STATUSES).toHaveLength(4);
  });

  it('INTENT_TYPES contains expected values', () => {
    expect(INTENT_TYPES).toContain('direct_override');
    expect(INTENT_TYPES).toContain('scoped_reoptimize');
    expect(INTENT_TYPES).toContain('structural_change');
    expect(INTENT_TYPES).toHaveLength(3);
  });
});

describe('createSegmentId', () => {
  it('generates IDs with seg_ prefix', () => {
    const id = createSegmentId();
    expect(id).toMatch(/^seg_/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createSegmentId()));
    expect(ids.size).toBe(50);
  });
});

describe('createVersionId', () => {
  it('pads single digit to 3 digits', () => {
    expect(createVersionId(1)).toBe('v_001');
  });

  it('pads double digit to 3 digits', () => {
    expect(createVersionId(42)).toBe('v_042');
  });

  it('keeps triple digit as-is', () => {
    expect(createVersionId(100)).toBe('v_100');
  });
});

describe('createProposalId', () => {
  it('generates correct format with slug from first 4 words', () => {
    const id = createProposalId('swap day two hotel for something nicer');
    expect(id).toMatch(/^prop_\d+_swap_day_two_hotel$/);
  });

  it('handles fewer than 4 words', () => {
    const id = createProposalId('add lunch');
    expect(id).toMatch(/^prop_\d+_add_lunch$/);
  });

  it('handles empty string', () => {
    const id = createProposalId('');
    expect(id).toMatch(/^prop_\d+_$/);
  });
});

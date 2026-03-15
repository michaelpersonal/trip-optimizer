import { describe, it, expect } from 'vitest';
import { pickMutationType } from '../../src/optimizer/mutations.js';

describe('pickMutationType', () => {
  it('rotates through mutation types', () => {
    const types = [0, 1, 2, 3, 4].map(i => pickMutationType(i, 0));
    expect(types).toEqual(['SWAP', 'UPGRADE', 'REORDER', 'SIMPLIFY', 'REALLOCATE']);
  });

  it('cycles back after full rotation', () => {
    expect(pickMutationType(5, 0)).toBe('SWAP');
    expect(pickMutationType(6, 0)).toBe('UPGRADE');
  });

  it('forces RESEARCH after 5 consecutive discards', () => {
    expect(pickMutationType(0, 5)).toBe('RESEARCH');
    expect(pickMutationType(10, 5)).toBe('RESEARCH');
    expect(pickMutationType(3, 7)).toBe('RESEARCH');
  });

  it('uses normal rotation when discards are below threshold', () => {
    expect(pickMutationType(0, 4)).toBe('SWAP');
    expect(pickMutationType(1, 3)).toBe('UPGRADE');
  });
});

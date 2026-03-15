import { describe, it, expect } from 'vitest';
import { getGlobalDir, getConfigPath, getProfilePath } from '../../src/data/paths.js';

describe('paths', () => {
  it('returns global dir under home', () => {
    const dir = getGlobalDir();
    expect(dir).toContain('.trip-optimizer');
  });

  it('returns config path ending with config.json', () => {
    expect(getConfigPath()).toMatch(/config\.json$/);
  });

  it('returns profile path ending with profile.json', () => {
    expect(getProfilePath()).toMatch(/profile\.json$/);
  });
});

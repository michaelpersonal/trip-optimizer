import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadProfile, saveProfile } from '../../src/data/profile.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('profile', () => {
  const testDir = path.join(os.tmpdir(), 'trip-opt-test-profile-' + Date.now());

  beforeEach(() => fs.mkdirSync(testDir, { recursive: true }));
  afterEach(() => fs.rmSync(testDir, { recursive: true, force: true }));

  it('returns default profile when no file exists', () => {
    const profile = loadProfile(testDir);
    expect(profile.loyalty_program).toBe('');
    expect(profile.dietary).toEqual([]);
    expect(profile.trips_completed).toBe(0);
  });

  it('saves and loads profile', () => {
    saveProfile({
      loyalty_program: 'marriott_bonvoy',
      dietary: ['no shellfish'],
      stated_vibes: ['wandering', 'food'],
      learned_vibes: [],
      anti_patterns: ['tourist traps'],
      anti_patterns_learned: [],
      source_trust: {},
      trips_completed: 0,
      last_debrief: '',
    }, testDir);
    const loaded = loadProfile(testDir);
    expect(loaded.loyalty_program).toBe('marriott_bonvoy');
    expect(loaded.dietary).toEqual(['no shellfish']);
  });
});

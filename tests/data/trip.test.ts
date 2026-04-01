import { describe, it, expect, afterEach } from 'vitest';
import { scaffoldTrip } from '../../src/data/trip.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('scaffoldTrip', () => {
  const testDir = path.join(os.tmpdir(), 'trip-scaffold-' + Date.now());

  afterEach(() => fs.rmSync(testDir, { recursive: true, force: true }));

  it('creates trip directory with all required files', async () => {
    const tripDir = path.join(testDir, 'japan-2027');
    await scaffoldTrip(tripDir, {
      constraints: 'trip:\n  name: test',
      rubrics: 'dimensions: {}',
      plan: '# Day 1\nArrival',
      program: '# Agent Instructions',
    });

    expect(fs.existsSync(path.join(tripDir, 'constraints.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(tripDir, 'rubrics.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(tripDir, 'plan.md'))).toBe(true);
    expect(fs.existsSync(path.join(tripDir, 'program.md'))).toBe(true);
    expect(fs.existsSync(path.join(tripDir, 'activities_db.json'))).toBe(true);
    expect(fs.existsSync(path.join(tripDir, '.gitignore'))).toBe(true);
  });

  it('creates empty activities_db.json', async () => {
    const tripDir = path.join(testDir, 'japan-2027');
    await scaffoldTrip(tripDir, {
      constraints: 'trip:\n  name: test',
      rubrics: 'dimensions: {}',
      plan: '# Day 1',
      program: '# Instructions',
    });

    const db = JSON.parse(fs.readFileSync(path.join(tripDir, 'activities_db.json'), 'utf-8'));
    expect(db).toEqual({});
  });

  it('initializes git repo with initial commit', async () => {
    const tripDir = path.join(testDir, 'japan-2027');
    await scaffoldTrip(tripDir, {
      constraints: 'trip:\n  name: test',
      rubrics: 'dimensions: {}',
      plan: '# Day 1',
      program: '# Instructions',
    });

    expect(fs.existsSync(path.join(tripDir, '.git'))).toBe(true);
  });

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

  it('writes correct file contents', async () => {
    const tripDir = path.join(testDir, 'japan-2027');
    await scaffoldTrip(tripDir, {
      constraints: 'trip:\n  name: Japan 2027',
      rubrics: 'dimensions:\n  food: {}',
      plan: '# Day 1\nTokyo arrival',
      program: '# Optimize this trip',
    });

    expect(fs.readFileSync(path.join(tripDir, 'constraints.yaml'), 'utf-8')).toBe('trip:\n  name: Japan 2027');
    expect(fs.readFileSync(path.join(tripDir, 'plan.md'), 'utf-8')).toBe('# Day 1\nTokyo arrival');
  });
});

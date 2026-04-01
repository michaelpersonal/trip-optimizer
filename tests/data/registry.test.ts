import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadRegistry,
  saveRegistry,
  registerTrip,
  unregisterTrip,
  getTrip,
  listTrips,
  setDefaultTrip,
  resolveTrip,
} from '../../src/data/registry.js';
import { CLIError } from '../../src/cli-utils/json-output.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('registry', () => {
  const testDir = path.join(os.tmpdir(), 'trip-opt-test-registry-' + Date.now());

  beforeEach(() => fs.mkdirSync(testDir, { recursive: true }));
  afterEach(() => fs.rmSync(testDir, { recursive: true, force: true }));

  it('loadRegistry returns empty when no file', () => {
    const reg = loadRegistry(testDir);
    expect(reg.trips).toEqual({});
    expect(reg.default_trip).toBeNull();
  });

  it('loadRegistry reads existing file', () => {
    const data = {
      trips: {
        'japan-2025': {
          path: '/tmp/japan',
          title: 'Japan Trip',
          created_at: '2025-01-01T00:00:00Z',
          status: 'active',
        },
      },
      default_trip: 'japan-2025',
    };
    fs.writeFileSync(path.join(testDir, 'trips.json'), JSON.stringify(data));
    const reg = loadRegistry(testDir);
    expect(reg.trips['japan-2025'].title).toBe('Japan Trip');
    expect(reg.default_trip).toBe('japan-2025');
  });

  it('registerTrip adds trip and sets first as default', () => {
    registerTrip('japan-2025', '/tmp/japan', 'Japan Trip', testDir);
    const reg = loadRegistry(testDir);
    expect(reg.trips['japan-2025']).toBeDefined();
    expect(reg.trips['japan-2025'].title).toBe('Japan Trip');
    expect(reg.default_trip).toBe('japan-2025');
  });

  it('registerTrip does not override default for second trip', () => {
    registerTrip('japan-2025', '/tmp/japan', 'Japan Trip', testDir);
    registerTrip('italy-2025', '/tmp/italy', 'Italy Trip', testDir);
    const reg = loadRegistry(testDir);
    expect(reg.default_trip).toBe('japan-2025');
    expect(Object.keys(reg.trips)).toHaveLength(2);
  });

  it('registerTrip throws on duplicate ID', () => {
    registerTrip('japan-2025', '/tmp/japan', 'Japan Trip', testDir);
    expect(() =>
      registerTrip('japan-2025', '/tmp/japan2', 'Japan Again', testDir)
    ).toThrow(CLIError);
    try {
      registerTrip('japan-2025', '/tmp/japan2', 'Japan Again', testDir);
    } catch (e) {
      expect((e as CLIError).code).toBe('TRIP_ID_CONFLICT');
    }
  });

  it('resolveTrip by explicit ID', () => {
    registerTrip('japan-2025', '/tmp/japan', 'Japan Trip', testDir);
    const result = resolveTrip('japan-2025', undefined, testDir);
    expect(result.tripId).toBe('japan-2025');
    expect(result.tripDir).toBe('/tmp/japan');
  });

  it('resolveTrip by default', () => {
    registerTrip('japan-2025', '/tmp/japan', 'Japan Trip', testDir);
    const result = resolveTrip(undefined, undefined, testDir);
    expect(result.tripId).toBe('japan-2025');
    expect(result.tripDir).toBe('/tmp/japan');
  });

  it('resolveTrip by cwd', () => {
    const cwdDir = path.join(testDir, 'my-trip');
    fs.mkdirSync(cwdDir, { recursive: true });
    fs.writeFileSync(path.join(cwdDir, 'constraints.yaml'), 'test: true');
    const result = resolveTrip(undefined, cwdDir, testDir);
    expect(result.tripId).toBeNull();
    expect(result.tripDir).toBe(cwdDir);
  });

  it('resolveTrip throws NO_TRIP_CONTEXT when nothing available', () => {
    const emptyDir = path.join(testDir, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    expect(() => resolveTrip(undefined, emptyDir, testDir)).toThrow(CLIError);
    try {
      resolveTrip(undefined, emptyDir, testDir);
    } catch (e) {
      expect((e as CLIError).code).toBe('NO_TRIP_CONTEXT');
    }
  });

  it('resolveTrip throws TRIP_NOT_FOUND for unknown ID', () => {
    expect(() => resolveTrip('nonexistent', undefined, testDir)).toThrow(CLIError);
    try {
      resolveTrip('nonexistent', undefined, testDir);
    } catch (e) {
      expect((e as CLIError).code).toBe('TRIP_NOT_FOUND');
    }
  });

  it('setDefaultTrip works and throws for unknown', () => {
    registerTrip('japan-2025', '/tmp/japan', 'Japan Trip', testDir);
    registerTrip('italy-2025', '/tmp/italy', 'Italy Trip', testDir);
    setDefaultTrip('italy-2025', testDir);
    const reg = loadRegistry(testDir);
    expect(reg.default_trip).toBe('italy-2025');

    expect(() => setDefaultTrip('nonexistent', testDir)).toThrow(CLIError);
    try {
      setDefaultTrip('nonexistent', testDir);
    } catch (e) {
      expect((e as CLIError).code).toBe('TRIP_NOT_FOUND');
    }
  });

  it('listTrips returns all trips', () => {
    registerTrip('japan-2025', '/tmp/japan', 'Japan Trip', testDir);
    registerTrip('italy-2025', '/tmp/italy', 'Italy Trip', testDir);
    const trips = listTrips(testDir);
    expect(Object.keys(trips)).toHaveLength(2);
    expect(trips['japan-2025'].title).toBe('Japan Trip');
    expect(trips['italy-2025'].title).toBe('Italy Trip');
  });

  it('unregisterTrip removes trip and updates default', () => {
    registerTrip('japan-2025', '/tmp/japan', 'Japan Trip', testDir);
    registerTrip('italy-2025', '/tmp/italy', 'Italy Trip', testDir);
    unregisterTrip('japan-2025', testDir);
    const reg = loadRegistry(testDir);
    expect(reg.trips['japan-2025']).toBeUndefined();
    expect(reg.default_trip).not.toBe('japan-2025');
  });

  it('getTrip returns entry or throws TRIP_NOT_FOUND', () => {
    registerTrip('japan-2025', '/tmp/japan', 'Japan Trip', testDir);
    const entry = getTrip('japan-2025', testDir);
    expect(entry.title).toBe('Japan Trip');

    expect(() => getTrip('nonexistent', testDir)).toThrow(CLIError);
  });
});

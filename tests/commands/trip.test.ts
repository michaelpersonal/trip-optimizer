import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  registerTrip,
  loadRegistry,
} from '../../src/data/registry.js';
import { tripListAction, tripShowAction, tripSetDefaultAction } from '../../src/commands/trip.js';
import type { Plan } from '../../src/data/plan-schema.js';

function makePlan(days: number = 2): Plan {
  return {
    version_id: 'v_001',
    parent_version_id: null,
    created_at: '2025-06-01T00:00:00Z',
    created_by: 'test',
    score: { composite: 85, components: {} },
    days: Array.from({ length: days }, (_, i) => ({
      day_index: i + 1,
      date: `2025-06-${String(i + 1).padStart(2, '0')}`,
      city: i === 0 ? 'Tokyo' : 'Kyoto',
      hotel: 'Test Hotel',
      transit: null,
      segments: [
        {
          id: `seg_${i + 1}`,
          type: 'activity' as const,
          period: 'morning' as const,
          title: `Activity ${i + 1}`,
          details: 'Details here',
          location: 'Somewhere',
          start_time: '09:00',
          end_time: '12:00',
          tags: [],
        },
      ],
      notes: '',
    })),
  };
}

describe('trip commands', () => {
  const testDir = path.join(os.tmpdir(), 'trip-opt-test-trip-cmd-' + Date.now());
  let stdoutData: string;
  let stderrData: string;

  beforeEach(() => {
    stdoutData = '';
    stderrData = '';
    fs.mkdirSync(testDir, { recursive: true });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdoutData += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderrData += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('tripListAction', () => {
    it('outputs empty list in JSON mode', async () => {
      await tripListAction({ json: true, _registryDir: testDir });
      const parsed = JSON.parse(stdoutData);
      expect(parsed.ok).toBe(true);
      expect(parsed.command).toBe('trip.list');
      expect(parsed.data.trips).toEqual({});
      expect(parsed.data.default_trip).toBeNull();
    });

    it('outputs registered trips in JSON mode', async () => {
      registerTrip('japan-2025', '/tmp/japan', 'Japan Trip', testDir);
      registerTrip('italy-2025', '/tmp/italy', 'Italy Trip', testDir);

      await tripListAction({ json: true, _registryDir: testDir });
      const parsed = JSON.parse(stdoutData);
      expect(parsed.ok).toBe(true);
      expect(Object.keys(parsed.data.trips)).toHaveLength(2);
      expect(parsed.data.default_trip).toBe('japan-2025');
    });

    it('outputs formatted list in terminal mode', async () => {
      registerTrip('japan-2025', '/tmp/japan', 'Japan Trip', testDir);

      await tripListAction({ json: false, _registryDir: testDir });
      expect(stdoutData).toContain('japan-2025');
      expect(stdoutData).toContain('Japan Trip');
    });
  });

  describe('tripShowAction', () => {
    it('shows plan data in JSON mode', async () => {
      const tripDir = path.join(testDir, 'trip-japan');
      fs.mkdirSync(tripDir, { recursive: true });
      fs.writeFileSync(path.join(tripDir, 'plan.json'), JSON.stringify(makePlan()));
      registerTrip('japan-2025', tripDir, 'Japan Trip', testDir);

      await tripShowAction({ trip: 'japan-2025', json: true, _registryDir: testDir });
      const parsed = JSON.parse(stdoutData);
      expect(parsed.ok).toBe(true);
      expect(parsed.command).toBe('trip.show');
      expect(parsed.trip_id).toBe('japan-2025');
      expect(parsed.data.days).toHaveLength(2);
    });

    it('filters by day', async () => {
      const tripDir = path.join(testDir, 'trip-japan');
      fs.mkdirSync(tripDir, { recursive: true });
      fs.writeFileSync(path.join(tripDir, 'plan.json'), JSON.stringify(makePlan()));
      registerTrip('japan-2025', tripDir, 'Japan Trip', testDir);

      await tripShowAction({ trip: 'japan-2025', day: 2, json: true, _registryDir: testDir });
      const parsed = JSON.parse(stdoutData);
      expect(parsed.ok).toBe(true);
      expect(parsed.data.days).toHaveLength(1);
      expect(parsed.data.days[0].day_index).toBe(2);
    });

    it('errors when plan.json is missing', async () => {
      const tripDir = path.join(testDir, 'trip-japan');
      fs.mkdirSync(tripDir, { recursive: true });
      registerTrip('japan-2025', tripDir, 'Japan Trip', testDir);

      await tripShowAction({ trip: 'japan-2025', json: true, _registryDir: testDir });
      const parsed = JSON.parse(stdoutData);
      expect(parsed.ok).toBe(false);
      expect(parsed.error.code).toBe('NO_PLAN');
    });

    it('errors for unknown trip', async () => {
      await tripShowAction({ trip: 'nonexistent', json: true, _registryDir: testDir });
      const parsed = JSON.parse(stdoutData);
      expect(parsed.ok).toBe(false);
      expect(parsed.error.code).toBe('TRIP_NOT_FOUND');
    });
  });

  describe('tripSetDefaultAction', () => {
    it('sets default trip', async () => {
      registerTrip('japan-2025', '/tmp/japan', 'Japan Trip', testDir);
      registerTrip('italy-2025', '/tmp/italy', 'Italy Trip', testDir);

      await tripSetDefaultAction('italy-2025', { _registryDir: testDir });
      const reg = loadRegistry(testDir);
      expect(reg.default_trip).toBe('italy-2025');
    });

    it('errors for unknown trip', async () => {
      await tripSetDefaultAction('nonexistent', { _registryDir: testDir });
      expect(stderrData).toContain('Trip ID not in registry');
    });
  });
});

import fs from 'fs';
import path from 'path';
import {
  listTrips,
  loadRegistry,
  setDefaultTrip,
  resolveTrip,
} from '../data/registry.js';
import { success, error, CLIError } from '../cli-utils/json-output.js';
import type { Plan } from '../data/plan-schema.js';

interface TripListOptions {
  json?: boolean;
  _registryDir?: string;
}

interface TripShowOptions {
  trip?: string;
  day?: number;
  json?: boolean;
  lang?: string;
  _registryDir?: string;
}

interface TripSetDefaultOptions {
  _registryDir?: string;
}

export async function tripListAction(options: TripListOptions): Promise<void> {
  const dir = options._registryDir;
  const trips = listTrips(dir);
  const registry = loadRegistry(dir);
  const default_trip = registry.default_trip;

  if (options.json) {
    success('trip.list', null, { trips, default_trip });
    return;
  }

  // Terminal mode
  const ids = Object.keys(trips);
  if (ids.length === 0) {
    process.stdout.write('No trips registered.\n');
    return;
  }

  process.stdout.write('\nRegistered trips:\n\n');
  for (const id of ids) {
    const entry = trips[id];
    const marker = id === default_trip ? ' (default)' : '';
    process.stdout.write(`  ${id}${marker} — ${entry.title}\n`);
  }
  process.stdout.write('\n');
}

export async function tripShowAction(options: TripShowOptions): Promise<void> {
  const dir = options._registryDir;

  // Resolve which trip to show
  let tripId: string | null;
  let tripDir: string;
  try {
    const resolved = resolveTrip(options.trip, undefined, dir);
    tripId = resolved.tripId;
    tripDir = resolved.tripDir;
  } catch (e) {
    if (e instanceof CLIError) {
      if (options.json) {
        error('trip.show', e.code);
        return;
      }
      process.stderr.write(`Error: ${e.message}\n`);
      if (e.hint) process.stderr.write(`Hint: ${e.hint}\n`);
      return;
    }
    throw e;
  }

  // Read plan.json
  const planPath = path.join(tripDir, 'plan.json');
  if (!fs.existsSync(planPath)) {
    if (options.json) {
      error('trip.show', 'NO_PLAN', tripId ?? undefined);
      return;
    }
    process.stderr.write('Error: Trip has no plan.json\n');
    return;
  }

  const plan: Plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));

  // Filter by day if requested
  if (options.day != null) {
    plan.days = plan.days.filter((d) => d.day_index === options.day);
  }

  if (options.json) {
    success('trip.show', tripId, plan);
    return;
  }

  // Terminal mode — print summary
  process.stdout.write(`\nTrip: ${tripId ?? tripDir}\n`);
  process.stdout.write(`Version: ${plan.version_id}  Score: ${plan.score.composite}\n\n`);
  for (const day of plan.days) {
    process.stdout.write(`  Day ${day.day_index}: ${day.city} (${day.date})\n`);
    for (const seg of day.segments) {
      process.stdout.write(`    ${seg.start_time}-${seg.end_time}  ${seg.title}\n`);
    }
  }
  process.stdout.write('\n');
}

export async function tripSetDefaultAction(
  tripId: string,
  options?: TripSetDefaultOptions,
): Promise<void> {
  const dir = options?._registryDir;
  try {
    setDefaultTrip(tripId, dir);
    process.stdout.write(`Default trip set to: ${tripId}\n`);
  } catch (e) {
    if (e instanceof CLIError) {
      process.stderr.write(`Error: ${e.message}\n`);
      if (e.hint) process.stderr.write(`Hint: ${e.hint}\n`);
      return;
    }
    throw e;
  }
}

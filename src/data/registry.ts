import fs from 'fs';
import path from 'path';
import { getGlobalDir } from './paths.js';
import type { TripRegistry, TripRegistryEntry } from './plan-schema.js';
import { CLIError } from '../cli-utils/json-output.js';

const REGISTRY_FILE = 'trips.json';

function emptyRegistry(): TripRegistry {
  return { trips: {}, default_trip: null };
}

export function loadRegistry(dir?: string): TripRegistry {
  const registryPath = path.join(dir ?? getGlobalDir(), REGISTRY_FILE);
  if (!fs.existsSync(registryPath)) return emptyRegistry();
  return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
}

export function saveRegistry(registry: TripRegistry, dir?: string): void {
  const d = dir ?? getGlobalDir();
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, REGISTRY_FILE), JSON.stringify(registry, null, 2));
}

export function registerTrip(tripId: string, tripPath: string, title: string, dir?: string): void {
  const registry = loadRegistry(dir);
  if (registry.trips[tripId]) {
    throw new CLIError('TRIP_ID_CONFLICT');
  }
  registry.trips[tripId] = {
    path: tripPath,
    title,
    created_at: new Date().toISOString(),
    status: 'active',
  };
  if (registry.default_trip === null) {
    registry.default_trip = tripId;
  }
  saveRegistry(registry, dir);
}

export function unregisterTrip(tripId: string, dir?: string): void {
  const registry = loadRegistry(dir);
  delete registry.trips[tripId];
  if (registry.default_trip === tripId) {
    const remaining = Object.keys(registry.trips);
    registry.default_trip = remaining.length > 0 ? remaining[0] : null;
  }
  saveRegistry(registry, dir);
}

export function getTrip(tripId: string, dir?: string): TripRegistryEntry {
  const registry = loadRegistry(dir);
  const entry = registry.trips[tripId];
  if (!entry) {
    throw new CLIError('TRIP_NOT_FOUND');
  }
  return entry;
}

export function listTrips(dir?: string): Record<string, TripRegistryEntry> {
  return loadRegistry(dir).trips;
}

export function setDefaultTrip(tripId: string, dir?: string): void {
  const registry = loadRegistry(dir);
  if (!registry.trips[tripId]) {
    throw new CLIError('TRIP_NOT_FOUND');
  }
  registry.default_trip = tripId;
  saveRegistry(registry, dir);
}

export function resolveTrip(
  tripId?: string,
  cwd?: string,
  dir?: string,
): { tripId: string | null; tripDir: string } {
  const registry = loadRegistry(dir);

  // 1. Explicit ID
  if (tripId) {
    const entry = registry.trips[tripId];
    if (!entry) {
      throw new CLIError('TRIP_NOT_FOUND');
    }
    return { tripId, tripDir: entry.path };
  }

  // 2. Default trip
  if (registry.default_trip && registry.trips[registry.default_trip]) {
    return {
      tripId: registry.default_trip,
      tripDir: registry.trips[registry.default_trip].path,
    };
  }

  // 3. CWD fallback — check for constraints.yaml
  if (cwd && fs.existsSync(path.join(cwd, 'constraints.yaml'))) {
    return { tripId: null, tripDir: cwd };
  }

  throw new CLIError('NO_TRIP_CONTEXT');
}

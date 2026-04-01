import path from 'path';
import os from 'os';

export function getGlobalDir(): string {
  return path.join(os.homedir(), '.trip-optimizer');
}

export function getConfigPath(): string {
  return path.join(getGlobalDir(), 'config.json');
}

export function getProfilePath(): string {
  return path.join(getGlobalDir(), 'profile.json');
}

export function getTripHistoryPath(): string {
  return path.join(getGlobalDir(), 'trip-history.json');
}

export function getLearnedPath(): string {
  return path.join(getGlobalDir(), 'learned.json');
}

export function getRegistryPath(): string {
  return path.join(getGlobalDir(), 'trips.json');
}

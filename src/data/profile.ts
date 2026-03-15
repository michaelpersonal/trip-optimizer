import fs from 'fs';
import path from 'path';
import { getGlobalDir } from './paths.js';

export interface Profile {
  loyalty_program: string;
  dietary: string[];
  stated_vibes: string[];
  learned_vibes: string[];
  anti_patterns: string[];
  anti_patterns_learned: string[];
  source_trust: Record<string, number>;
  trips_completed: number;
  last_debrief: string;
}

const DEFAULT_PROFILE: Profile = {
  loyalty_program: '',
  dietary: [],
  stated_vibes: [],
  learned_vibes: [],
  anti_patterns: [],
  anti_patterns_learned: [],
  source_trust: {},
  trips_completed: 0,
  last_debrief: '',
};

export function loadProfile(dir?: string): Profile {
  const profilePath = path.join(dir ?? getGlobalDir(), 'profile.json');
  if (!fs.existsSync(profilePath)) return { ...DEFAULT_PROFILE };
  return JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
}

export function saveProfile(profile: Profile, dir?: string): void {
  const d = dir ?? getGlobalDir();
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'profile.json'), JSON.stringify(profile, null, 2));
}

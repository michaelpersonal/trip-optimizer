import fs from 'fs';
import path from 'path';
import { getGlobalDir } from './paths.js';

export interface SearchApiConfig {
  provider: string;
  api_key: string;
}

export interface Config {
  provider: string;
  api_key: string;
  search_api?: SearchApiConfig;
}

const DEFAULT_CONFIG: Config = {
  provider: 'anthropic',
  api_key: '',
};

export function loadConfig(dir?: string): Config {
  const configPath = path.join(dir ?? getGlobalDir(), 'config.json');
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

export function saveConfig(config: Config, dir?: string): void {
  const d = dir ?? getGlobalDir();
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify(config, null, 2));
}

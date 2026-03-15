import fs from 'fs';
import path from 'path';
import { getGlobalDir } from './paths.js';
import type { Language } from '../i18n.js';

export interface SearchApiConfig {
  provider: string;
  api_key: string;
}

export interface ModelOverride {
  provider_type: 'openai-compatible';
  model: string;
  base_url: string;
  api_key: string;
}

export interface Config {
  provider: string;
  api_key: string;
  language: Language;
  search_api?: SearchApiConfig;
  model_override?: ModelOverride;
}

const DEFAULT_CONFIG: Config = {
  provider: 'anthropic',
  api_key: '',
  language: 'en',
};

export function loadConfig(dir?: string): Config {
  const configPath = path.join(dir ?? getGlobalDir(), 'config.json');
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };
  const loaded = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return { ...DEFAULT_CONFIG, ...loaded };
}

export function saveConfig(config: Config, dir?: string): void {
  const d = dir ?? getGlobalDir();
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify(config, null, 2));
}

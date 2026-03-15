import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, saveConfig } from '../../src/data/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('config', () => {
  const testDir = path.join(os.tmpdir(), 'trip-opt-test-config-' + Date.now());

  beforeEach(() => fs.mkdirSync(testDir, { recursive: true }));
  afterEach(() => fs.rmSync(testDir, { recursive: true, force: true }));

  it('returns default config when no file exists', () => {
    const config = loadConfig(testDir);
    expect(config.provider).toBe('anthropic');
    expect(config.api_key).toBe('');
  });

  it('saves and loads config', () => {
    saveConfig({ provider: 'anthropic', api_key: 'sk-test' }, testDir);
    const loaded = loadConfig(testDir);
    expect(loaded.api_key).toBe('sk-test');
  });

  it('saves config with search_api', () => {
    saveConfig({
      provider: 'anthropic',
      api_key: 'sk-test',
      search_api: { provider: 'tavily', api_key: 'tvly-test' },
    }, testDir);
    const loaded = loadConfig(testDir);
    expect(loaded.search_api?.provider).toBe('tavily');
  });
});

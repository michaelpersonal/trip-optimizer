import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/commands/run-agent.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  dts: false,
  splitting: true,
  skipNodeModulesBundle: true,
  banner: { js: '#!/usr/bin/env node' },
});

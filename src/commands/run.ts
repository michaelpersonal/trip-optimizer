import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { loadConfig } from '../data/config.js';
import { AnthropicProvider } from '../llm/anthropic.js';
import { runOptimizationLoop } from '../optimizer/loop.js';

interface RunOptions {
  agent?: boolean;
  safe?: boolean;
}

export async function runCommand(options: RunOptions): Promise<void> {
  const cwd = process.cwd();

  if (!fs.existsSync(path.join(cwd, 'constraints.yaml'))) {
    console.log(chalk.red('\n  Not in a trip project directory (no constraints.yaml found).\n'));
    process.exit(1);
  }

  if (options.agent) {
    const { launchAgent } = await import('./run-agent.js');
    await launchAgent(cwd, { safe: options.safe });
    return;
  }

  const config = loadConfig();
  if (!config.api_key) {
    console.log(chalk.red('\n  No API key configured. Run: trip-optimizer config set api_key <key>\n'));
    process.exit(1);
  }

  const provider = new AnthropicProvider(config.api_key);

  console.log(chalk.bold('\n  trip-optimizer: standalone mode\n'));

  await runOptimizationLoop({
    provider,
    tripDir: cwd,
    onIteration: () => {}, // console output handled in loop
  });
}

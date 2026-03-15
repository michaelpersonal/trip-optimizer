import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { loadConfig } from '../data/config.js';
import { createProvider } from '../llm/factory.js';
import { runOptimizationLoop } from '../optimizer/loop.js';

interface RunOptions {
  standalone?: boolean;
  safe?: boolean;
}

export async function runCommand(options: RunOptions): Promise<void> {
  const cwd = process.cwd();

  if (!fs.existsSync(path.join(cwd, 'constraints.yaml'))) {
    console.log(chalk.red('\n  Not in a trip project directory (no constraints.yaml found).\n'));
    process.exit(1);
  }

  if (options.standalone) {
    const config = loadConfig();
    const provider = createProvider(config);

    console.log(chalk.bold('\n  trip-optimizer: standalone mode\n'));

    await runOptimizationLoop({
      provider,
      tripDir: cwd,
      onIteration: () => {},
    });
    return;
  }

  // Default: agent mode (yolo)
  const { launchAgent } = await import('./run-agent.js');
  await launchAgent(cwd, { safe: options.safe });
}

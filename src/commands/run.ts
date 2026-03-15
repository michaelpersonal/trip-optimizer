import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { loadConfig } from '../data/config.js';
import { createProvider } from '../llm/factory.js';
import { runOptimizationLoop } from '../optimizer/loop.js';

interface RunOptions {
  standalone?: boolean;
  headless?: boolean;
  safe?: boolean;
}

export async function runCommand(options: RunOptions): Promise<void> {
  const cwd = process.cwd();

  if (!fs.existsSync(path.join(cwd, 'constraints.yaml'))) {
    console.log(chalk.red('\n  Not in a trip project directory (no constraints.yaml found).\n'));
    process.exit(1);
  }

  const config = loadConfig();

  if (options.standalone) {
    const provider = createProvider(config);

    const modelName = config.model_override?.model || process.env.ANTHROPIC_MODEL || 'default';
    console.log(chalk.bold(`\n  trip-optimizer: standalone mode (${modelName})\n`));

    await runOptimizationLoop({
      provider,
      tripDir: cwd,
      onIteration: () => {},
    });
    return;
  }

  // Agent mode requires Claude Code — warn if custom model is configured
  if (config.model_override) {
    console.log(chalk.yellow('\n  Custom model configured — agent mode still uses Claude Code.'));
    console.log(chalk.yellow('  Use --standalone to run with your custom model.\n'));
  }

  // Default: agent mode (interactive)
  const { launchAgent } = await import('./run-agent.js');
  await launchAgent(cwd, { safe: options.safe, headless: options.headless });
}

import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { generateProgram } from '../generators/program.js';
import { loadConfig } from '../data/config.js';
import type { TripConstraints } from '../data/schemas.js';

export async function launchAgent(tripDir: string, options: { safe?: boolean }): Promise<void> {
  // 1. Check claude is available
  try {
    execSync('which claude', { stdio: 'ignore' });
  } catch {
    console.log(chalk.red('\n  Claude Code CLI not found. Install it first: https://docs.anthropic.com/en/docs/claude-code\n'));
    process.exit(1);
  }

  // 2. Load constraints + config
  const constraintsPath = path.join(tripDir, 'constraints.yaml');
  if (!fs.existsSync(constraintsPath)) {
    console.log(chalk.red('\n  Not in a trip project directory (no constraints.yaml found).\n'));
    process.exit(1);
  }

  const constraints = yaml.load(fs.readFileSync(constraintsPath, 'utf-8')) as TripConstraints;
  const config = loadConfig();

  // 3. Generate program.md
  const programContent = generateProgram(constraints, config);
  const programPath = path.join(tripDir, 'program.md');
  fs.writeFileSync(programPath, programContent);
  console.log(chalk.green(`\n  Generated ${programPath}`));

  // 4. Launch claude as interactive session
  const args: string[] = [];
  if (!options.safe) {
    args.push('--dangerously-skip-permissions');
  }

  const mode = options.safe ? 'safe mode' : 'yolo mode';
  console.log(chalk.bold(`  Launching Claude Code in ${mode}...`));
  console.log(chalk.dim(`  program.md is ready — tell Claude to "Read program.md and start optimizing"\n`));

  const child = spawn('claude', args, {
    cwd: tripDir,
    stdio: 'inherit',
  });

  return new Promise<void>((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0 || code === null) {
        console.log(chalk.green('\n  Agent session ended.\n'));
      } else {
        console.log(chalk.yellow(`\n  Agent exited with code ${code}.\n`));
      }
      resolve();
    });

    child.on('error', (err) => {
      console.log(chalk.red(`\n  Failed to launch Claude Code: ${err.message}\n`));
      reject(err);
    });
  });
}

import chalk from 'chalk';
import { loadConfig, saveConfig } from '../data/config.js';

export function configCommand(args: string[]): void {
  const config = loadConfig();

  if (args.length === 0) {
    // Show current config
    console.log(chalk.bold('\n  Configuration\n'));
    console.log(`  Provider: ${config.provider}`);
    console.log(`  API Key: ${config.api_key ? config.api_key.substring(0, 10) + '...' : chalk.dim('not set')}`);
    if (config.search_api) {
      console.log(`  Search API: ${config.search_api.provider}`);
      console.log(`  Search Key: ${config.search_api.api_key ? config.search_api.api_key.substring(0, 10) + '...' : chalk.dim('not set')}`);
    }
    console.log();
    return;
  }

  if (args[0] === 'set' && args.length >= 3) {
    const key = args[1];
    const value = args.slice(2).join(' ');

    if (key === 'provider') config.provider = value;
    else if (key === 'api_key') config.api_key = value;
    else if (key === 'search_api.provider') {
      config.search_api = config.search_api || { provider: '', api_key: '' };
      config.search_api.provider = value;
    } else if (key === 'search_api.api_key') {
      config.search_api = config.search_api || { provider: '', api_key: '' };
      config.search_api.api_key = value;
    } else {
      console.log(chalk.red(`  Unknown config key: ${key}`));
      return;
    }

    saveConfig(config);
    console.log(chalk.green(`  Set ${key} = ${key.includes('key') ? value.substring(0, 10) + '...' : value}`));
    return;
  }

  console.log('  Usage: trip-optimizer config [set <key> <value>]');
}

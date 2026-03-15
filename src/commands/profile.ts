import chalk from 'chalk';
import { loadProfile } from '../data/profile.js';

export function profileCommand(): void {
  const profile = loadProfile();

  console.log(chalk.bold('\n  Travel Profile\n'));
  console.log(`  Loyalty Program: ${profile.loyalty_program || chalk.dim('none')}`);
  console.log(`  Dietary: ${profile.dietary.length > 0 ? profile.dietary.join(', ') : chalk.dim('none')}`);
  console.log(`  Stated Vibes: ${profile.stated_vibes.length > 0 ? profile.stated_vibes.join(', ') : chalk.dim('none')}`);

  if (profile.learned_vibes.length > 0) {
    console.log(`  Learned Vibes: ${profile.learned_vibes.join(', ')}`);
  }
  if (profile.anti_patterns.length > 0) {
    console.log(`  Anti-patterns: ${profile.anti_patterns.join(', ')}`);
  }
  if (profile.anti_patterns_learned.length > 0) {
    console.log(`  Learned Anti-patterns: ${profile.anti_patterns_learned.join(', ')}`);
  }

  console.log(`  Trips Completed: ${profile.trips_completed}`);
  if (profile.last_debrief) {
    console.log(`  Last Debrief: ${profile.last_debrief}`);
  }

  if (Object.keys(profile.source_trust).length > 0) {
    console.log(`  Source Trust:`);
    for (const [source, trust] of Object.entries(profile.source_trust)) {
      console.log(`    ${source}: ${trust}`);
    }
  }
  console.log();
}

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

export function planCommand(): void {
  const cwd = process.cwd();
  const planPath = path.join(cwd, 'plan.md');

  if (!fs.existsSync(planPath)) {
    console.log(chalk.red('\n  No plan.md found in current directory.\n'));
    process.exit(1);
  }

  const content = fs.readFileSync(planPath, 'utf-8');
  const lines = content.split('\n');

  console.log();

  for (const line of lines) {
    console.log(formatLine(line));
  }

  console.log();
}

function formatLine(line: string): string {
  // Day headers: "## Day 1" or "# Day 1" patterns
  if (/^#{1,3}\s+Day\s+\d+/i.test(line)) {
    return chalk.bold.magenta(line);
  }

  // Top-level headers
  if (/^#{1,2}\s+/.test(line)) {
    return chalk.bold.cyan(line);
  }

  // Sub-headers
  if (/^#{3,}\s+/.test(line)) {
    return chalk.bold(line);
  }

  // Format times (e.g., "8:00", "14:30", "8:00 AM")
  let formatted = line.replace(
    /\b(\d{1,2}:\d{2}(\s*[AaPp][Mm])?)\b/g,
    (match) => chalk.bold(match)
  );

  // Highlight restaurant/food keywords (common patterns)
  formatted = formatted.replace(
    /(?:restaurant|cafe|bakery|noodle|dumpling|hotpot|teahouse|bistro|eatery|diner|food stall|street food)/gi,
    (match) => chalk.yellow(match)
  );

  // Highlight restaurant names in quotes or after "Lunch:" / "Dinner:" / "Breakfast:"
  formatted = formatted.replace(
    /(?:Lunch|Dinner|Breakfast|Brunch|Snack):\s*(.+?)(?:\s*[-\u2013\u2014(]|$)/gi,
    (match, name) => match.replace(name, chalk.yellow(name))
  );

  // Highlight activity-like items (names in **bold** markdown)
  formatted = formatted.replace(
    /\*\*([^*]+)\*\*/g,
    (_match, name) => chalk.cyan.bold(name)
  );

  // Highlight hotel/accommodation mentions
  formatted = formatted.replace(
    /(?:hotel|hostel|guesthouse|airbnb|accommodation|check[- ]?in|check[- ]?out|Le\s+M[eé]ridien|Sheraton|Courtyard|Marriott)/gi,
    (match) => chalk.blue(match)
  );

  // Highlight costs/prices
  formatted = formatted.replace(
    /[¥$]\s?\d[\d,.]*/g,
    (match) => chalk.green(match)
  );

  return formatted;
}

import chalk from 'chalk';
import { resolveTrip } from '../data/registry.js';
import { listProposals } from '../data/proposals.js';
import { success, error } from '../cli-utils/json-output.js';
import type { ProposalStatus } from '../data/plan-schema.js';

interface ProposalsOptions {
  trip?: string;
  status?: string;
  json?: boolean;
}

export function proposalsAction(options: ProposalsOptions): void {
  let resolved;
  try {
    resolved = resolveTrip(options.trip);
  } catch (err: any) {
    if (options.json) { error('proposals', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n  ${err.hint}\n`)); }
    return;
  }

  const statusFilter = options.status as ProposalStatus | undefined;
  const proposals = listProposals(resolved.tripDir, statusFilter);

  if (options.json) {
    success('proposals', resolved.tripId, { proposals });
    return;
  }

  if (proposals.length === 0) {
    console.log(chalk.yellow('\n  No proposals found.\n'));
    return;
  }

  console.log(chalk.bold(`\n  Proposals for ${resolved.tripId}:\n`));
  for (const p of proposals) {
    const statusColor = p.status === 'pending' ? chalk.yellow : p.status === 'applied' ? chalk.green : chalk.red;
    console.log(`    ${chalk.bold(p.proposal_id)}  ${statusColor(p.status)}`);
    console.log(`      ${p.raw_request}`);
    if (p.impact_summary) {
      const delta = p.impact_summary.score_delta;
      console.log(`      Score: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`);
    }
    console.log();
  }
}

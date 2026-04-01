import chalk from 'chalk';
import { resolveTrip } from '../data/registry.js';
import { readProposal, updateProposalStatus } from '../data/proposals.js';
import { success, error } from '../cli-utils/json-output.js';

interface RejectOptions {
  trip?: string;
  proposal: string;
  json?: boolean;
}

export function rejectAction(options: RejectOptions): void {
  let resolved;
  try {
    resolved = resolveTrip(options.trip);
  } catch (err: any) {
    if (options.json) { error('reject', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n`)); }
    return;
  }

  let proposal;
  try {
    proposal = readProposal(resolved.tripDir, options.proposal);
  } catch (err: any) {
    if (options.json) { error('reject', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n  ${err.hint}\n`)); }
    return;
  }

  // Idempotent
  if (proposal.status === 'rejected') {
    if (options.json) {
      success('reject', resolved.tripId, { status: 'already_rejected', proposal_id: proposal.proposal_id });
    } else {
      console.log(chalk.yellow(`\n  Proposal ${proposal.proposal_id} was already rejected.\n`));
    }
    return;
  }

  updateProposalStatus(resolved.tripDir, proposal.proposal_id, 'rejected');

  if (options.json) {
    success('reject', resolved.tripId, { status: 'rejected', proposal_id: proposal.proposal_id });
  } else {
    console.log(chalk.green(`\n  Rejected: ${proposal.proposal_id}\n`));
  }
}

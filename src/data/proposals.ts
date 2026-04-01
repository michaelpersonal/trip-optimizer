import fs from 'fs';
import path from 'path';
import type { Proposal, ProposalStatus } from './plan-schema.js';
import { CLIError } from '../cli-utils/json-output.js';

function proposalsDir(tripDir: string): string {
  return path.join(tripDir, 'proposals');
}

function proposalPath(tripDir: string, proposalId: string): string {
  return path.join(proposalsDir(tripDir), `${proposalId}.json`);
}

export function writeProposal(tripDir: string, proposal: Proposal): void {
  const dir = proposalsDir(tripDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(proposalPath(tripDir, proposal.proposal_id), JSON.stringify(proposal, null, 2));
}

export function readProposal(tripDir: string, proposalId: string): Proposal {
  const filePath = proposalPath(tripDir, proposalId);
  if (!fs.existsSync(filePath)) {
    throw new CLIError('PROPOSAL_NOT_FOUND');
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Proposal;
}

export function listProposals(tripDir: string, status?: ProposalStatus): Proposal[] {
  const dir = proposalsDir(tripDir);
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const proposals = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Proposal);

  if (status != null) {
    return proposals.filter((p) => p.status === status);
  }
  return proposals;
}

export function updateProposalStatus(tripDir: string, proposalId: string, status: ProposalStatus): Proposal {
  const proposal = readProposal(tripDir, proposalId);
  proposal.status = status;
  writeProposal(tripDir, proposal);
  return proposal;
}

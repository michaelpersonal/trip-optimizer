import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import simpleGit from 'simple-git';
import { resolveTrip } from '../data/registry.js';
import { readProposal, updateProposalStatus } from '../data/proposals.js';
import { renderPlanMarkdown } from '../data/plan-renderer.js';
import { success, error, CLIError } from '../cli-utils/json-output.js';
import type { Plan } from '../data/plan-schema.js';

interface ApplyOptions {
  trip?: string;
  proposal: string;
  approvedBy?: string;
  json?: boolean;
  _registryDir?: string;
}

interface ConstraintsMeta {
  trip_name?: string;
  total_days?: number;
  start_date?: string;
  end_date?: string;
}

export async function applyAction(options: ApplyOptions): Promise<void> {
  const dir = options._registryDir;

  // 1. Resolve trip
  let tripId: string | null;
  let tripDir: string;
  try {
    const resolved = resolveTrip(options.trip, undefined, dir);
    tripId = resolved.tripId;
    tripDir = resolved.tripDir;
  } catch (err: any) {
    if (options.json) { error('apply', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n`)); }
    return;
  }

  // 2. Read proposal
  let proposal;
  try {
    proposal = readProposal(tripDir, options.proposal);
  } catch (err: any) {
    if (options.json) { error('apply', err.code); } else { console.log(chalk.red(`\n  ${err.message}\n  ${err.hint}\n`)); }
    return;
  }

  // 3. Idempotent: already applied
  if (proposal.status === 'applied') {
    if (options.json) {
      success('apply', tripId, { status: 'already_applied', proposal_id: proposal.proposal_id });
    } else {
      console.log(chalk.yellow(`\n  Proposal ${proposal.proposal_id} was already applied.\n`));
    }
    return;
  }

  // 4. Conflict check: read current plan and compare version
  const planPath = path.join(tripDir, 'plan.json');
  if (!fs.existsSync(planPath)) {
    if (options.json) { error('apply', 'NO_PLAN', tripId ?? undefined); } else { console.log(chalk.red('\n  No plan.json found.\n')); }
    return;
  }

  const currentPlan: Plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
  if (currentPlan.version_id !== proposal.base_version_id) {
    if (options.json) { error('apply', 'PROPOSAL_CONFLICT', tripId ?? undefined); } else { console.log(chalk.red(`\n  Conflict: plan is at ${currentPlan.version_id} but proposal targets ${proposal.base_version_id}\n`)); }
    return;
  }

  // 5. Validate candidate plan
  if (proposal.candidate_plan == null) {
    if (options.json) { error('apply', 'PROPOSAL_NOT_FOUND', tripId ?? undefined); } else { console.log(chalk.red('\n  Proposal has no candidate plan.\n')); }
    return;
  }

  // 6. Apply: write candidate plan to plan.json
  const newPlan = proposal.candidate_plan;
  fs.writeFileSync(planPath, JSON.stringify(newPlan, null, 2));

  // 7. Render plan.md
  try {
    const constraintsPath = path.join(tripDir, 'constraints.yaml');
    let meta: ConstraintsMeta = {};
    if (fs.existsSync(constraintsPath)) {
      meta = yaml.load(fs.readFileSync(constraintsPath, 'utf-8')) as ConstraintsMeta;
    }
    const tripName = meta.trip_name ?? tripId ?? 'Trip';
    const totalDays = meta.total_days ?? newPlan.days.length;
    const startDate = meta.start_date ?? newPlan.days[0]?.date ?? '';
    const endDate = meta.end_date ?? newPlan.days[newPlan.days.length - 1]?.date ?? '';

    const md = renderPlanMarkdown(newPlan, tripName, totalDays, startDate, endDate);
    fs.writeFileSync(path.join(tripDir, 'plan.md'), md);
  } catch {
    // Non-fatal: plan.json was written successfully
  }

  // 8. Update proposal status
  updateProposalStatus(tripDir, proposal.proposal_id, 'applied');

  // 9. Git commit (non-fatal)
  try {
    const git = simpleGit(tripDir);
    await git.add(['plan.json', 'plan.md', `proposals/${proposal.proposal_id}.json`]);
    await git.commit(`apply: ${proposal.proposal_id} — ${proposal.raw_request}`);
  } catch {
    // Non-fatal if git fails
  }

  // 10. Return result
  const result = {
    status: 'applied' as const,
    proposal_id: proposal.proposal_id,
    new_version_id: newPlan.version_id,
    approved_by: options.approvedBy ?? null,
    impact_summary: proposal.impact_summary,
    announcement: `Applied proposal ${proposal.proposal_id}: ${proposal.raw_request}`,
  };

  if (options.json) {
    success('apply', tripId, result);
  } else {
    console.log(chalk.green(`\n  Applied: ${proposal.proposal_id}`));
    console.log(`  New version: ${newPlan.version_id}`);
    if (proposal.impact_summary) {
      const delta = proposal.impact_summary.score_delta;
      console.log(`  Score: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`);
    }
    console.log();
  }
}

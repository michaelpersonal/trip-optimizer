import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { registerTrip } from '../data/registry.js';
import { createProvider } from '../llm/factory.js';
import { loadConfig } from '../data/config.js';
import { parseJsonResponse } from '../llm/json-parser.js';
import { renderPlanMarkdown } from '../data/plan-renderer.js';
import { success, error, stderrLog, CLIError } from '../cli-utils/json-output.js';
import { createVersionId } from '../data/plan-schema.js';
import type { Plan } from '../data/plan-schema.js';
import type { TripConstraints } from '../data/schemas.js';

interface MigrateOptions {
  id?: string;
  dryRun?: boolean;
  json?: boolean;
  verbose?: boolean;
  _registryDir?: string;
}

function buildMigratePrompt(planMd: string): string {
  return `You are a travel plan parser. Convert the following plan.md into a structured plan.json format.

The Plan JSON schema is:
{
  "version_id": "v_001",
  "parent_version_id": null,
  "created_at": "<ISO 8601 timestamp>",
  "created_by": "migrate",
  "score": { "composite": 0, "components": {} },
  "days": [
    {
      "day_index": <number starting at 1>,
      "date": "<YYYY-MM-DD>",
      "city": "<city name>",
      "hotel": "<hotel name or null>",
      "transit": { "mode": "<flight|train|bus|etc>", "detail": "<details>" } or null,
      "segments": [
        {
          "id": "seg_<random>",
          "type": "<activity|meal|transit|free_time|hotel>",
          "period": "<morning|lunch|afternoon|dinner|evening>",
          "title": "<segment title>",
          "details": "<description>",
          "location": "<location>",
          "start_time": "<HH:MM>",
          "end_time": "<HH:MM>",
          "tags": []
        }
      ],
      "notes": "<any day-level notes or empty string>"
    }
  ]
}

Rules:
- Generate unique segment IDs in format seg_<random alphanumeric>
- Classify each segment type accurately (activity, meal, transit, free_time, hotel)
- Assign appropriate periods based on time of day
- If dates are not explicit, infer reasonable dates
- If times are not explicit, infer reasonable times
- Preserve all information from the original plan
- Set version_id to "v_001", parent_version_id to null, created_by to "migrate"
- Set score to { "composite": 0, "components": {} }

Respond with ONLY the JSON Plan object (no wrapping, no markdown fences).

Here is the plan.md content:

${planMd}`;
}

function validateParsedPlan(parsed: any): parsed is Plan {
  if (!parsed || typeof parsed !== 'object') return false;
  if (!Array.isArray(parsed.days) || parsed.days.length === 0) return false;
  for (const day of parsed.days) {
    if (typeof day.day_index !== 'number') return false;
    if (!Array.isArray(day.segments)) return false;
  }
  return true;
}

export async function migrateAction(tripPath: string, options: MigrateOptions): Promise<void> {
  const resolvedPath = path.resolve(tripPath);

  // 1. Validate: check that path has constraints.yaml and plan.md
  const constraintsPath = path.join(resolvedPath, 'constraints.yaml');
  const planMdPath = path.join(resolvedPath, 'plan.md');

  if (!fs.existsSync(constraintsPath) || !fs.existsSync(planMdPath)) {
    if (options.json) {
      error('migrate', 'MIGRATION_FAILED');
      return;
    }
    process.stderr.write('Error: Directory must contain both constraints.yaml and plan.md\n');
    process.stderr.write(`  Checked: ${resolvedPath}\n`);
    return;
  }

  // 2. Derive trip ID from directory name or --id override
  const tripId = options.id ?? path.basename(resolvedPath);

  if (options.verbose) {
    stderrLog(`Trip ID: ${tripId}`);
    stderrLog(`Trip path: ${resolvedPath}`);
  }

  // Read constraints for rendering later
  let constraints: TripConstraints | null = null;
  try {
    constraints = yaml.load(fs.readFileSync(constraintsPath, 'utf-8')) as TripConstraints;
  } catch { /* ignore parse errors */ }

  // 3. LLM-assisted parse: send plan.md + schema to LLM
  const planMd = fs.readFileSync(planMdPath, 'utf-8');
  const prompt = buildMigratePrompt(planMd);

  let rawResponse: string;
  const config = loadConfig();
  const provider = createProvider(config);

  try {
    if (options.verbose) stderrLog('Sending plan.md to LLM for parsing...');
    rawResponse = await provider.complete(prompt, 32000);
  } catch (e) {
    if (options.json) {
      error('migrate', 'LLM_ERROR');
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Error: Model call failed — ${msg}\n`);
    return;
  }

  // 4. Parse and validate
  let parsedPlan: Plan;
  try {
    parsedPlan = parseJsonResponse(rawResponse) as Plan;
  } catch (e) {
    if (options.json) {
      error('migrate', 'MIGRATION_FAILED');
      return;
    }
    process.stderr.write('Error: Could not parse LLM response as valid JSON\n');
    if (options.verbose) {
      stderrLog(`Raw response: ${rawResponse.slice(0, 500)}`);
    }
    return;
  }

  if (!validateParsedPlan(parsedPlan)) {
    if (options.json) {
      error('migrate', 'MIGRATION_FAILED');
      return;
    }
    process.stderr.write('Error: Parsed plan is missing required fields (days array)\n');
    return;
  }

  // Ensure standard fields
  parsedPlan.version_id = parsedPlan.version_id || createVersionId(1);
  parsedPlan.parent_version_id = null;
  parsedPlan.created_at = parsedPlan.created_at || new Date().toISOString();
  parsedPlan.created_by = 'migrate';
  parsedPlan.score = parsedPlan.score || { composite: 0, components: {} };

  if (options.verbose) {
    stderrLog(`Parsed ${parsedPlan.days.length} days, ${parsedPlan.days.reduce((n, d) => n + d.segments.length, 0)} segments`);
  }

  // 5. Dry run: output plan.json to stdout and stop
  if (options.dryRun) {
    if (options.json) {
      success('migrate', tripId, { plan: parsedPlan, dry_run: true });
    } else {
      process.stdout.write(JSON.stringify(parsedPlan, null, 2));
    }
    return;
  }

  // 6. Write plan.json, create proposals/ dir
  const planJsonPath = path.join(resolvedPath, 'plan.json');
  fs.writeFileSync(planJsonPath, JSON.stringify(parsedPlan, null, 2));

  const proposalsDir = path.join(resolvedPath, 'proposals');
  fs.mkdirSync(proposalsDir, { recursive: true });

  // 7. Render plan.rendered.md from plan.json
  const tripName = constraints?.trip?.name ?? tripId;
  const totalDays = constraints?.trip?.total_days ?? parsedPlan.days.length;
  const startDate = constraints?.trip?.start_date ?? parsedPlan.days[0]?.date ?? '';
  const endDate = constraints?.trip?.end_date ?? parsedPlan.days[parsedPlan.days.length - 1]?.date ?? '';

  const renderedMd = renderPlanMarkdown(parsedPlan, tripName, totalDays, startDate, endDate);
  const renderedPath = path.join(resolvedPath, 'plan.rendered.md');
  fs.writeFileSync(renderedPath, renderedMd);

  // 8. Register trip
  try {
    registerTrip(tripId, resolvedPath, tripName, options._registryDir);
  } catch (e) {
    if (e instanceof CLIError && e.code === 'TRIP_ID_CONFLICT') {
      if (options.verbose) stderrLog(`Warning: Trip ID "${tripId}" already registered, skipping registration`);
    } else {
      throw e;
    }
  }

  // 9. Git commit (non-fatal)
  try {
    const git = simpleGit(resolvedPath);
    await git.add(['plan.json', 'plan.rendered.md']);
    await git.commit(`migrate: convert plan.md to plan.json for ${tripId}`);
    if (options.verbose) stderrLog('Git commit created');
  } catch (e) {
    if (options.verbose) {
      stderrLog(`Warning: git commit failed — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 10. Output summary
  if (options.json) {
    success('migrate', tripId, {
      trip_id: tripId,
      trip_path: resolvedPath,
      days: parsedPlan.days.length,
      segments: parsedPlan.days.reduce((n, d) => n + d.segments.length, 0),
      files_written: ['plan.json', 'plan.rendered.md'],
    });
  } else {
    console.log(chalk.green(`\n  Migration complete: ${tripId}`));
    console.log(`  Path: ${resolvedPath}`);
    console.log(`  Days: ${parsedPlan.days.length}`);
    console.log(`  Segments: ${parsedPlan.days.reduce((n, d) => n + d.segments.length, 0)}`);
    console.log(`  Files written: plan.json, plan.rendered.md`);
    console.log(`  Registered as: ${tripId}`);
    console.log();
  }
}

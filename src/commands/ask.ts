import fs from 'fs';
import path from 'path';
import { resolveTrip } from '../data/registry.js';
import { success, error, stderrLog, CLIError } from '../cli-utils/json-output.js';
import { createProvider } from '../llm/factory.js';
import { loadConfig } from '../data/config.js';
import { parseJsonResponse } from '../llm/json-parser.js';
import type { Plan } from '../data/plan-schema.js';

interface AskOptions {
  trip?: string;
  question: string;
  lang?: string;
  json?: boolean;
}

export async function askAction(options: AskOptions): Promise<void> {
  const lang = options.lang ?? 'en';

  // 1. Resolve trip
  let tripId: string | null;
  let tripDir: string;
  try {
    const resolved = resolveTrip(options.trip);
    tripId = resolved.tripId;
    tripDir = resolved.tripDir;
  } catch (e) {
    if (e instanceof CLIError) {
      if (options.json) {
        error('ask', e.code);
        return;
      }
      process.stderr.write(`Error: ${e.message}\n`);
      if (e.hint) process.stderr.write(`Hint: ${e.hint}\n`);
      return;
    }
    throw e;
  }

  // 2. Read plan.json
  const planPath = path.join(tripDir, 'plan.json');
  if (!fs.existsSync(planPath)) {
    if (options.json) {
      error('ask', 'NO_PLAN', tripId ?? undefined);
      return;
    }
    process.stderr.write('Error: Trip has no plan.json\n');
    return;
  }

  const plan: Plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));

  // 3. Build LLM prompt
  const langInstruction =
    lang === 'zh'
      ? 'Respond entirely in Chinese (中文).'
      : 'Respond in English.';

  const prompt = `You are a travel assistant answering questions about a trip plan.

Rules:
- Answer ONLY from the plan data provided below. Do not invent information.
- Reference days and segment IDs when relevant.
- Keep your answer concise and conversational.
- ${langInstruction}

Respond with a JSON object with these fields:
- "answer": string — your answer to the question
- "referenced_days": number[] — day indices referenced in your answer
- "referenced_segments": string[] — segment IDs referenced in your answer

Trip plan:
${JSON.stringify(plan, null, 2)}

User question: ${options.question}`;

  // 4. Call LLM
  let rawResponse: string;
  try {
    stderrLog('Thinking...');
    const provider = createProvider(loadConfig());
    rawResponse = await provider.complete(prompt, 4000);
  } catch (e) {
    if (options.json) {
      error('ask', 'LLM_ERROR', tripId ?? undefined);
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Error: Model call failed — ${msg}\n`);
    return;
  }

  // 5. Parse response
  let parsed: { answer: string; referenced_days?: number[]; referenced_segments?: string[] };
  try {
    parsed = parseJsonResponse(rawResponse);
  } catch {
    // 9. Fallback: use raw response as the answer
    parsed = { answer: rawResponse, referenced_days: [], referenced_segments: [] };
  }

  // 6/7. Output
  if (options.json) {
    success('ask', tripId, { ...parsed, language: lang });
  } else {
    process.stdout.write(`\n${parsed.answer}\n\n`);
  }
}

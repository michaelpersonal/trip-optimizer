# trip-optimizer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript CLI tool that autonomously optimizes travel plans using the autoresearch pattern (research, mutate, score, keep/discard) with persistent memory across trips.

**Architecture:** Three-layer design — CLI (commander), Engine (LLM scoring + optimization loop), Data (git-backed trips + `~/.trip-optimizer/` global profile). Two run modes: standalone (direct API calls) and agent (Claude Code with yolo mode). BYOK with Anthropic-first provider abstraction.

**Tech Stack:** TypeScript, Node.js 22, commander (CLI), Anthropic SDK, simple-git, js-yaml, inquirer (interactive prompts), vitest (testing), tsup (bundling)

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `src/cli.ts`
- Create: `.gitignore`

**Step 1: Initialize npm project and install dependencies**

```bash
cd /data/home/mguo/code/general/trip-optimizer
npm init -y
npm install commander @anthropic-ai/sdk simple-git js-yaml inquirer chalk ora
npm install -D typescript @types/node @types/js-yaml @types/inquirer vitest tsup
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
*.tgz
results.tsv
score_history.jsonl
```

**Step 4: Create entry points**

`src/index.ts` — exports for programmatic use
`src/cli.ts` — CLI entry point with commander, registers all commands

Set up `package.json` bin field:
```json
{
  "bin": { "trip-optimizer": "./dist/cli.js" },
  "type": "module",
  "scripts": {
    "build": "tsup src/cli.ts --format esm --dts",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 5: Create minimal CLI with help command**

`src/cli.ts`:
```typescript
import { Command } from 'commander';

const program = new Command();

program
  .name('trip-optimizer')
  .description('Autonomously optimize travel plans using the autoresearch pattern')
  .version('0.1.0');

// Commands will be added in subsequent tasks

program.parse();
```

**Step 6: Verify it runs**

Run: `npx tsx src/cli.ts --help`
Expected: Shows "trip-optimizer" with version and description

**Step 7: Initialize git repo and commit**

```bash
git init
git add -A
git commit -m "feat: project scaffolding with TypeScript, commander CLI"
```

---

## Task 2: Data Layer — Global Profile & Config

**Files:**
- Create: `src/data/config.ts`
- Create: `src/data/profile.ts`
- Create: `src/data/paths.ts`
- Create: `tests/data/config.test.ts`
- Create: `tests/data/profile.test.ts`

**Step 1: Write tests for paths module**

`tests/data/paths.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getGlobalDir, getConfigPath, getProfilePath } from '../../src/data/paths';
import path from 'path';

describe('paths', () => {
  it('returns global dir under home', () => {
    const dir = getGlobalDir();
    expect(dir).toContain('.trip-optimizer');
  });

  it('returns config path', () => {
    expect(getConfigPath()).toMatch(/config\.json$/);
  });

  it('returns profile path', () => {
    expect(getProfilePath()).toMatch(/profile\.json$/);
  });
});
```

**Step 2: Implement paths module**

`src/data/paths.ts`:
```typescript
import path from 'path';
import os from 'os';

export function getGlobalDir(): string {
  return path.join(os.homedir(), '.trip-optimizer');
}

export function getConfigPath(): string {
  return path.join(getGlobalDir(), 'config.json');
}

export function getProfilePath(): string {
  return path.join(getGlobalDir(), 'profile.json');
}

export function getTripHistoryPath(): string {
  return path.join(getGlobalDir(), 'trip-history.json');
}

export function getLearnedPath(): string {
  return path.join(getGlobalDir(), 'learned.json');
}
```

**Step 3: Write tests for config module**

`tests/data/config.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, saveConfig, type Config } from '../../src/data/config';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('config', () => {
  const testDir = path.join(os.tmpdir(), 'trip-opt-test-' + Date.now());

  beforeEach(() => fs.mkdirSync(testDir, { recursive: true }));
  afterEach(() => fs.rmSync(testDir, { recursive: true, force: true }));

  it('returns default config when no file exists', () => {
    const config = loadConfig(testDir);
    expect(config.provider).toBe('anthropic');
    expect(config.api_key).toBe('');
  });

  it('saves and loads config', () => {
    const config: Config = { provider: 'anthropic', api_key: 'sk-test' };
    saveConfig(config, testDir);
    const loaded = loadConfig(testDir);
    expect(loaded.api_key).toBe('sk-test');
  });
});
```

**Step 4: Implement config module**

`src/data/config.ts`:
```typescript
import fs from 'fs';
import path from 'path';

export interface Config {
  provider: string;
  api_key: string;
  search_api?: {
    provider: string;
    api_key: string;
  };
}

const DEFAULT_CONFIG: Config = {
  provider: 'anthropic',
  api_key: '',
};

export function loadConfig(dir?: string): Config {
  const configPath = path.join(dir ?? getDefaultDir(), 'config.json');
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

export function saveConfig(config: Config, dir?: string): void {
  const d = dir ?? getDefaultDir();
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify(config, null, 2));
}

function getDefaultDir(): string {
  return path.join(require('os').homedir(), '.trip-optimizer');
}
```

**Step 5: Write tests for profile module**

`tests/data/profile.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadProfile, saveProfile, type Profile } from '../../src/data/profile';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('profile', () => {
  const testDir = path.join(os.tmpdir(), 'trip-opt-profile-' + Date.now());

  beforeEach(() => fs.mkdirSync(testDir, { recursive: true }));
  afterEach(() => fs.rmSync(testDir, { recursive: true, force: true }));

  it('returns default profile when no file exists', () => {
    const profile = loadProfile(testDir);
    expect(profile.loyalty_program).toBe('');
    expect(profile.dietary).toEqual([]);
    expect(profile.trips_completed).toBe(0);
  });

  it('saves and loads profile', () => {
    const profile: Profile = {
      loyalty_program: 'marriott_bonvoy',
      dietary: ['no shellfish'],
      stated_vibes: ['wandering', 'food'],
      learned_vibes: [],
      anti_patterns: ['tourist traps'],
      anti_patterns_learned: [],
      source_trust: {},
      trips_completed: 0,
      last_debrief: '',
    };
    saveProfile(profile, testDir);
    const loaded = loadProfile(testDir);
    expect(loaded.loyalty_program).toBe('marriott_bonvoy');
    expect(loaded.dietary).toEqual(['no shellfish']);
  });
});
```

**Step 6: Implement profile module**

`src/data/profile.ts` — same pattern as config: load/save JSON with defaults.

**Step 7: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: data layer — config and profile management with tests"
```

---

## Task 3: LLM Provider Abstraction

**Files:**
- Create: `src/llm/provider.ts`
- Create: `src/llm/anthropic.ts`
- Create: `src/llm/json-parser.ts`
- Create: `tests/llm/json-parser.test.ts`

**Step 1: Write tests for JSON parser**

`tests/llm/json-parser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseJsonResponse } from '../../src/llm/json-parser';

describe('parseJsonResponse', () => {
  it('parses clean JSON', () => {
    expect(parseJsonResponse('{"a": 1}')).toEqual({ a: 1 });
  });

  it('extracts JSON from markdown code block', () => {
    expect(parseJsonResponse('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('handles +N values', () => {
    expect(parseJsonResponse('{"delta": +3}')).toEqual({ delta: 3 });
  });

  it('extracts JSON object from surrounding text', () => {
    expect(parseJsonResponse('Here is the result: {"a": 1} done')).toEqual({ a: 1 });
  });

  it('extracts JSON array', () => {
    expect(parseJsonResponse('[{"a": 1}]')).toEqual([{ a: 1 }]);
  });

  it('throws on unparseable input', () => {
    expect(() => parseJsonResponse('not json at all')).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/llm/json-parser.test.ts`
Expected: FAIL — module not found

**Step 3: Implement JSON parser**

`src/llm/json-parser.ts` — port the `parse_json_response` logic from `scoring_v2.py`:
- Strip markdown code blocks
- Replace `+N` with `N`
- Try direct parse, then extract `{...}`, then extract `[...]`
- Handle truncated arrays

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/llm/json-parser.test.ts`
Expected: PASS

**Step 5: Create provider interface**

`src/llm/provider.ts`:
```typescript
export interface LLMProvider {
  complete(prompt: string, maxTokens: number): Promise<string>;
}
```

**Step 6: Implement Anthropic provider**

`src/llm/anthropic.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from './provider';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(prompt: string, maxTokens: number): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Expected text response');
    return block.text.trim();
  }
}
```

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: LLM provider abstraction with Anthropic and JSON parser"
```

---

## Task 4: YAML Schemas & Trip Scaffolding

**Files:**
- Create: `src/data/schemas.ts`
- Create: `src/data/trip.ts`
- Create: `src/templates/gitignore.ts`
- Create: `tests/data/trip.test.ts`

**Step 1: Define TypeScript types for constraints and rubrics**

`src/data/schemas.ts`:
```typescript
export interface TripConstraints {
  trip: {
    name: string;
    start_date: string;
    end_date: string;
    total_days: number;
    travelers: number;
    origin: string;
  };
  cities: Array<{
    name: string;
    key: string;
    min_days: number;
    max_days: number;
  }>;
  hard_requirements: string[];
  preferences: {
    priority_order: string[];
    anti_patterns: string[];
    pro_patterns: string[];
  };
  dietary: string[];
  loyalty_program: string;
  budget: {
    total: number;
    currency: string;
  };
}

export interface RubricAnchor {
  [score: number]: string;
}

export interface SubDimension {
  description: string;
  anchors: RubricAnchor;
}

export interface Dimension {
  weight: number;
  sub_dimensions: Record<string, SubDimension>;
}

export interface Rubrics {
  dimensions: Record<string, Dimension>;
  adversarial_penalties: Record<string, Array<{
    rule: string;
    penalty: number;
  }>>;
}

export interface ActivityEntry {
  name: string;
  name_local?: string;
  type: string;
  score: number;
  authenticity: number;
  uniqueness?: number;
  notes: string;
  crowd_level?: string;
  cost_per_person: number;
  currency: string;
  duration_hours: number;
  location: string;
  best_time?: string;
  seasonal?: string | null;
  source: string;
}

export interface RestaurantEntry {
  name: string;
  name_local?: string;
  cuisine: string;
  score: number;
  authenticity: number;
  notes: string;
  cost_per_person: number;
  currency: string;
  location: string;
  reservation_needed: boolean;
  source: string;
}

export interface CityResearch {
  activities: ActivityEntry[];
  restaurants: RestaurantEntry[];
  neighborhoods_for_wandering: Array<{
    name: string;
    vibe_score: number;
    walkability: string;
    notes: string;
  }>;
  tourist_traps: Array<{
    name: string;
    reason: string;
  }>;
  seasonal_highlights: string[];
}

export type ActivitiesDB = Record<string, CityResearch>;
```

**Step 2: Write tests for trip scaffolding**

`tests/data/trip.test.ts`:
```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { scaffoldTrip } from '../../src/data/trip';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('scaffoldTrip', () => {
  const testDir = path.join(os.tmpdir(), 'trip-scaffold-' + Date.now());

  afterEach(() => fs.rmSync(testDir, { recursive: true, force: true }));

  it('creates trip directory with required files', () => {
    const tripDir = path.join(testDir, 'japan-2027');
    scaffoldTrip(tripDir, {
      constraints: 'trip:\n  name: test',
      rubrics: 'dimensions: {}',
      plan: '# Day 1',
      program: '# Instructions',
    });

    expect(fs.existsSync(path.join(tripDir, 'constraints.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(tripDir, 'rubrics.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(tripDir, 'plan.md'))).toBe(true);
    expect(fs.existsSync(path.join(tripDir, 'program.md'))).toBe(true);
    expect(fs.existsSync(path.join(tripDir, 'activities_db.json'))).toBe(true);
    expect(fs.existsSync(path.join(tripDir, '.gitignore'))).toBe(true);
  });

  it('initializes git repo', () => {
    const tripDir = path.join(testDir, 'japan-2027');
    scaffoldTrip(tripDir, {
      constraints: 'trip:\n  name: test',
      rubrics: 'dimensions: {}',
      plan: '# Day 1',
      program: '# Instructions',
    });

    expect(fs.existsSync(path.join(tripDir, '.git'))).toBe(true);
  });
});
```

**Step 3: Implement trip scaffolding**

`src/data/trip.ts`:
- Takes a directory path and generated content strings
- Creates directory, writes all files
- Creates empty `activities_db.json` (`{}`)
- Writes `.gitignore` (results.tsv, score_history.jsonl, node_modules)
- Initializes git repo, makes initial commit

**Step 4: Run tests**

Run: `npx vitest run tests/data/trip.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: YAML schemas, TypeScript types, trip scaffolding with git init"
```

---

## Task 5: `init` Command — Interactive Setup

**Files:**
- Create: `src/commands/init.ts`
- Create: `src/generators/constraints.ts`
- Create: `src/generators/rubrics.ts`
- Create: `src/generators/plan.ts`
- Create: `src/generators/program.ts`
- Modify: `src/cli.ts` — register init command

**Step 1: Create constraints generator**

`src/generators/constraints.ts`:
- Takes answers from interactive prompts
- Generates `constraints.yaml` string using js-yaml
- Maps user inputs (dates, cities, budget, vibes, dietary, loyalty) to the `TripConstraints` schema
- Auto-calculates `total_days` from dates
- Sets default `min_days`/`max_days` per city based on total days and city count

**Step 2: Create rubrics generator**

`src/generators/rubrics.ts`:
- Takes constraints + profile (with learned signals if available)
- Builds a prompt that includes the China trip rubric as a seed example
- Calls LLM to generate custom `rubrics.yaml` for this trip type
- Includes learned signals from `learned.json` if present
- Returns YAML string

The prompt structure:
```
Generate a scoring rubric for this trip:
[constraints summary]

[learned signals from past trips, if any]

Use this rubric as a structural example (adapt dimensions and anchors to fit THIS trip):
[china trip rubric as seed]

Return valid YAML matching this schema: dimensions with sub_dimensions, anchors, weights summing to 1.0, and adversarial_penalties.
```

**Step 3: Create plan generator**

`src/generators/plan.ts`:
- Takes constraints
- Calls LLM to generate initial baseline itinerary as markdown
- Plan includes YAML frontmatter (trip metadata) + daily itinerary body
- Returns markdown string

**Step 4: Create program.md generator**

`src/generators/program.ts`:
- Takes constraints + config (to determine available research tools)
- Generates agent operating instructions
- Adapts research strategy section based on what's available
- Includes mutation rules, crash recovery instructions, context management tips
- Returns markdown string

**Step 5: Create init command**

`src/commands/init.ts`:
- Uses inquirer for interactive prompts
- Checks if profile exists — if not, runs first-time setup (API key, loyalty, dietary)
- If profile exists, shows "Welcome back" with learned preferences summary
- Collects trip-specific info: name, dates, travelers, cities, budget, vibes, anti-patterns
- Calls generators for constraints, rubrics, plan, program
- Shows spinner (ora) during LLM calls
- Calls `scaffoldTrip` to create the project
- Prints next steps

**Step 6: Register init in CLI**

Modify `src/cli.ts`:
```typescript
import { initCommand } from './commands/init';
program.command('init <name>').description('Create a new trip project').action(initCommand);
```

**Step 7: Manual test**

Run: `npx tsx src/cli.ts init "Test Trip"` (with ANTHROPIC_API_KEY set)
Expected: Interactive prompts, generates project directory

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: init command with interactive setup and LLM-generated scaffolding"
```

---

## Task 6: `config` and `profile` Commands

**Files:**
- Create: `src/commands/config.ts`
- Create: `src/commands/profile.ts`
- Modify: `src/cli.ts` — register commands

**Step 1: Create config command**

`src/commands/config.ts`:
- `trip-optimizer config` — shows current config (API key masked)
- `trip-optimizer config set provider anthropic`
- `trip-optimizer config set api_key sk-ant-...`
- `trip-optimizer config set search_api.provider tavily`
- `trip-optimizer config set search_api.api_key tvly-...`

**Step 2: Create profile command**

`src/commands/profile.ts`:
- `trip-optimizer profile` — shows current profile in formatted output
- `trip-optimizer profile edit` — interactive prompt to update fields
- `trip-optimizer profile reset` — reset to defaults (with confirmation)

**Step 3: Register in CLI**

**Step 4: Manual test**

Run: `npx tsx src/cli.ts profile`
Expected: Shows profile or "No profile found"

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: config and profile management commands"
```

---

## Task 7: Scoring Engine — Dimension Scoring (Pass 1)

**Files:**
- Create: `src/scoring/scorer.ts`
- Create: `src/scoring/dimension-scorer.ts`
- Create: `src/scoring/prompts.ts`
- Create: `tests/scoring/dimension-scorer.test.ts`

**Step 1: Write tests for dimension scorer**

`tests/scoring/dimension-scorer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildDimensionPrompt, buildRubricText } from '../../src/scoring/prompts';

describe('buildRubricText', () => {
  it('formats sub-dimensions with anchors', () => {
    const dim = {
      weight: 0.25,
      sub_dimensions: {
        authenticity: {
          description: 'Are activities local-oriented?',
          anchors: { 60: 'Tourist traps', 90: 'Local showed you' },
        },
      },
    };
    const text = buildRubricText(dim);
    expect(text).toContain('authenticity');
    expect(text).toContain('60:');
    expect(text).toContain('90:');
  });
});

describe('buildDimensionPrompt', () => {
  it('includes plan content and rubric', () => {
    const prompt = buildDimensionPrompt('experience_quality', {
      weight: 0.25,
      sub_dimensions: {
        authenticity: {
          description: 'test',
          anchors: { 80: 'good' },
        },
      },
    }, 'The travel plan content here');
    expect(prompt).toContain('experience_quality');
    expect(prompt).toContain('The travel plan content here');
    expect(prompt).toContain('authenticity');
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run tests/scoring/dimension-scorer.test.ts`
Expected: FAIL

**Step 3: Implement scoring prompts**

`src/scoring/prompts.ts`:
- `buildRubricText(dimension)` — formats sub-dimensions + anchors
- `buildDimensionPrompt(dimName, dimConfig, planContent)` — full prompt for scoring one dimension
- `buildCriticPrompt(plan, activitiesDb, rubrics)` — adversarial critic prompt
- `buildHolisticPrompt(allScores)` — holistic cross-dimension prompt
- `buildComparativePrompt(oldPlan, newPlan, mutation, rubrics)` — pairwise comparison prompt

**Step 4: Implement dimension scorer**

`src/scoring/dimension-scorer.ts`:
```typescript
import type { LLMProvider } from '../llm/provider';
import type { Dimension } from '../data/schemas';
import { buildDimensionPrompt } from './prompts';
import { parseJsonResponse } from '../llm/json-parser';

export interface SubDimensionScore {
  score: number;
  note: string;
}

export interface DimensionResult {
  score: number;
  weight: number;
  sub_dimensions: Record<string, SubDimensionScore>;
}

export async function scoreDimension(
  provider: LLMProvider,
  dimName: string,
  dimConfig: Dimension,
  planContent: string,
): Promise<DimensionResult> {
  const prompt = buildDimensionPrompt(dimName, dimConfig, planContent);
  const response = await provider.complete(prompt, 800);
  const result = parseJsonResponse(response);
  // Parse sub-dimension scores, compute average
  // Return DimensionResult
}
```

**Step 5: Run tests**

Run: `npx vitest run tests/scoring/dimension-scorer.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: dimension scoring (pass 1) with prompt builders"
```

---

## Task 8: Scoring Engine — Adversarial Critic (Pass 2) & Holistic (Pass 3)

**Files:**
- Create: `src/scoring/critic.ts`
- Create: `src/scoring/holistic.ts`
- Create: `tests/scoring/critic.test.ts`

**Step 1: Write test for penalty-to-dimension mapping**

`tests/scoring/critic.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { mapPenaltyToDimension } from '../../src/scoring/critic';

describe('mapPenaltyToDimension', () => {
  it('maps logistics to logistics_efficiency', () => {
    expect(mapPenaltyToDimension('logistics')).toBe('logistics_efficiency');
  });

  it('maps food to food_score', () => {
    expect(mapPenaltyToDimension('food')).toBe('food_score');
  });

  it('defaults to logistics_efficiency for unknown', () => {
    expect(mapPenaltyToDimension('unknown')).toBe('logistics_efficiency');
  });
});
```

**Step 2: Implement critic**

`src/scoring/critic.ts`:
- `runAdversarialCritic(provider, plan, activitiesDb, rubrics)` — calls LLM with critic prompt, returns penalty list
- `mapPenaltyToDimension(category)` — maps penalty categories to scoring dimensions
- `applyPenalties(scores, penalties, maxPerDimension)` — applies penalties, capping per dimension

**Step 3: Implement holistic pass**

`src/scoring/holistic.ts`:
- `runHolisticPass(provider, allScores)` — calls LLM with cross-dimension prompt, returns adjustments capped at +/-5

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All pass

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: adversarial critic (pass 2) and holistic adjustment (pass 3)"
```

---

## Task 9: Scoring Engine — Full Scorer & Comparative Mode

**Files:**
- Create: `src/scoring/absolute.ts`
- Create: `src/scoring/comparative.ts`
- Create: `src/scoring/types.ts`
- Modify: `src/scoring/scorer.ts` — orchestrator

**Step 1: Define score result types**

`src/scoring/types.ts`:
```typescript
export interface AbsoluteScoreResult {
  mode: 'absolute';
  composite_score: number;
  components: Record<string, DimensionResult>;
  penalties: Penalty[];
  holistic_adjustments: Adjustment[];
  scored_at: string;
  model: string;
}

export interface ComparativeScoreResult {
  mode: 'comparative';
  verdict: 'better' | 'worse' | 'neutral';
  composite_delta: number;
  sub_dimension_deltas: Record<string, number>;
  dimension_deltas: Record<string, { delta: number; weight: number }>;
  mutation: string;
  scored_at: string;
  model: string;
}
```

**Step 2: Implement absolute scoring**

`src/scoring/absolute.ts`:
- Orchestrates: dimension scoring for each dim → critic → penalties → holistic → composite
- Returns `AbsoluteScoreResult`

**Step 3: Implement comparative scoring**

`src/scoring/comparative.ts`:
- Takes old plan, new plan, mutation description
- Single LLM call for pairwise comparison
- Returns deltas per sub-dimension, clamped to +/-5
- Computes composite delta from weighted dimension deltas
- Returns `ComparativeScoreResult`

**Step 4: Create scorer orchestrator**

`src/scoring/scorer.ts`:
```typescript
export class Scorer {
  constructor(private provider: LLMProvider) {}

  async scoreAbsolute(plan, activitiesDb, constraints, rubrics): Promise<AbsoluteScoreResult> { ... }
  async scoreComparative(oldPlan, newPlan, mutation, rubrics): Promise<ComparativeScoreResult> { ... }
}
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: full scorer with absolute and comparative modes"
```

---

## Task 10: `score` Command

**Files:**
- Create: `src/commands/score.ts`
- Modify: `src/cli.ts` — register command

**Step 1: Implement score command**

`src/commands/score.ts`:
- Reads `constraints.yaml`, `rubrics.yaml`, `plan.md`, `activities_db.json` from current directory
- Creates LLM provider from config
- Runs absolute scoring
- Writes `score.json`
- Prints formatted results (dimension scores, penalties, holistic adjustments, composite)

**Step 2: Register in CLI**

**Step 3: Manual test**

Create a test trip directory with sample files, run `npx tsx src/cli.ts score`
Expected: Scores printed, `score.json` written

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: score command — one-off absolute scoring"
```

---

## Task 11: Optimization Loop — Mutations

**Files:**
- Create: `src/optimizer/mutations.ts`
- Create: `src/optimizer/types.ts`
- Create: `tests/optimizer/mutations.test.ts`

**Step 1: Define mutation types**

`src/optimizer/types.ts`:
```typescript
export type MutationType = 'SWAP' | 'REALLOCATE' | 'REORDER' | 'UPGRADE' | 'SIMPLIFY' | 'RESEARCH';

export interface MutationResult {
  type: MutationType;
  description: string;
  newPlanContent: string;
}

export interface IterationLog {
  iteration: number;
  commit: string;
  score_before: number;
  score_after: number;
  delta: number;
  status: 'keep' | 'discard';
  mutation_type: MutationType;
  description: string;
}
```

**Step 2: Write test for mutation type selection**

`tests/optimizer/mutations.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { pickMutationType } from '../../src/optimizer/mutations';

describe('pickMutationType', () => {
  it('rotates through mutation types', () => {
    const types = [0, 1, 2, 3, 4].map(i => pickMutationType(i, 0));
    expect(new Set(types).size).toBeGreaterThan(1);
  });

  it('forces RESEARCH after 5 consecutive discards', () => {
    expect(pickMutationType(10, 5)).toBe('RESEARCH');
  });
});
```

**Step 3: Implement mutation generator**

`src/optimizer/mutations.ts`:
- `pickMutationType(iteration, consecutiveDiscards)` — rotation logic, RESEARCH on 5+ discards
- `generateMutation(provider, type, plan, activitiesDb, constraints, lastScore)` — LLM call to generate specific mutation, returns `MutationResult` with new plan content

Each mutation type has its own prompt:
- SWAP: "Find the lowest-scoring activity and replace it with a higher-scored alternative from the database"
- REALLOCATE: "Move one day from the city with the most slack to the city that feels most rushed"
- REORDER: "Pick the day with the worst geographic clustering and reorder activities"
- UPGRADE: "Find a generic restaurant and replace with a more authentic option from the database"
- SIMPLIFY: "Find the weakest activity and replace it with free wandering time"
- RESEARCH: "Generate new activity/restaurant options for the weakest-scoring city"

**Step 4: Run tests**

Run: `npx vitest run tests/optimizer/mutations.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: mutation type selection and LLM-based mutation generation"
```

---

## Task 12: Optimization Loop — Git Ratchet & Run Command

**Files:**
- Create: `src/optimizer/loop.ts`
- Create: `src/optimizer/logger.ts`
- Create: `src/commands/run.ts`
- Create: `src/commands/status.ts`
- Modify: `src/cli.ts` — register commands

**Step 1: Implement results logger**

`src/optimizer/logger.ts`:
- `appendResult(resultsPath, log: IterationLog)` — appends TSV row
- `readResults(resultsPath)` — reads TSV, returns `IterationLog[]`
- `getLastBestScore(resultsPath)` — finds last "keep" entry, returns score
- TSV header: `iteration\tcommit\tscore_before\tscore_after\tdelta\tstatus\tmutation_type\tdescription`

**Step 2: Implement optimization loop**

`src/optimizer/loop.ts`:
```typescript
export async function runOptimizationLoop(options: {
  provider: LLMProvider;
  tripDir: string;
  recalibrationInterval?: number; // default 10
  onIteration?: (log: IterationLog) => void;
}): Promise<void> {
  // 1. Load constraints, rubrics, plan, activities_db
  // 2. Check results.tsv for crash recovery — resume from last iteration
  // 3. Score baseline if first run (absolute mode)
  // 4. Loop:
  //    a. Pick mutation type
  //    b. Generate mutation via LLM
  //    c. Write new plan.md
  //    d. Git commit
  //    e. Score (comparative, absolute every N iterations)
  //    f. If improved: keep, update best score
  //    g. If worse: git reset --hard HEAD~1
  //    h. Log to results.tsv
  //    i. Call onIteration callback
  // 5. Handle Ctrl+C gracefully
}
```

Uses `simple-git` for all git operations.

**Step 3: Implement run command**

`src/commands/run.ts`:
- Validates current directory is a trip project (has constraints.yaml)
- Creates LLM provider from config
- Calls `runOptimizationLoop` with console output callback
- Prints each iteration result inline
- Handles `--agent` flag (Task 15)

**Step 4: Implement status command**

`src/commands/status.ts`:
- Reads `results.tsv` and `score.json` from current directory
- Shows: trip name, current iteration, best score, delta from baseline, last mutation, consecutive keeps/discards streak
- Shows research coverage from `activities_db.json`

**Step 5: Register commands in CLI**

**Step 6: Manual test**

Set up a test trip with `init`, then run `npx tsx src/cli.ts run` (let it do 2-3 iterations, Ctrl+C)
Expected: Iterations logged, plan.md mutated, git log shows commits

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: optimization loop with git ratchet, run and status commands"
```

---

## Task 13: `research` Command

**Files:**
- Create: `src/research/researcher.ts`
- Create: `src/commands/research.ts`
- Modify: `src/cli.ts` — register command

**Step 1: Implement researcher**

`src/research/researcher.ts`:
- `researchCity(provider, cityKey, constraints, existingDb)` — LLM call to generate activities, restaurants, neighborhoods, tourist traps, seasonal highlights for a city
- Returns partial `CityResearch` to merge into `activities_db.json`
- Tags all entries with `source: "llm_knowledge"`
- Prompt instructs LLM to focus on: authentic local spots, hidden gems, seasonal specialties, tourist traps to avoid, neighborhoods for wandering

**Step 2: Implement research command**

`src/commands/research.ts`:
- `trip-optimizer research <city>` — runs research sprint for one city
- `trip-optimizer research` (no arg) — researches all cities
- Merges results into `activities_db.json` without overwriting existing entries
- Shows count of new entries found
- Git commits the updated database

**Step 3: Register in CLI**

**Step 4: Manual test**

Run: `npx tsx src/cli.ts research tokyo` in a test trip
Expected: `activities_db.json` populated with Tokyo entries

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: research command — LLM-based city research sprint"
```

---

## Task 14: Dashboard & Chart Commands

**Files:**
- Create: `src/commands/dashboard.ts`
- Create: `src/commands/chart.ts`
- Create: `src/commands/plan.ts`
- Modify: `src/cli.ts` — register commands

**Step 1: Implement dashboard**

`src/commands/dashboard.ts`:
- Reads `results.tsv`, `score.json`, `activities_db.json`, `constraints.yaml`
- Renders terminal UI using chalk:
  - Score with progress bar
  - Dimension scores with trend arrows
  - Last 5 mutations with keep/discard status
  - Research coverage bars per city
  - Stats: penalties remaining, uptime, iteration rate
- In `--watch` mode: re-renders every 5 seconds (reads files on each tick)

**Step 2: Implement chart command**

`src/commands/chart.ts`:
- Reads `results.tsv`
- Generates ASCII chart of composite score over time using `asciichart` package
- If `--png` flag: note that PNG generation requires `canvas` package (optional dependency)

Install: `npm install asciichart`

**Step 3: Implement plan command**

`src/commands/plan.ts`:
- Reads `plan.md` from current directory
- Pretty-prints with chalk formatting (headers, times, restaurants highlighted)
- Optionally renders to a separate formatted output file

**Step 4: Register all commands in CLI**

**Step 5: Manual test**

Run: `npx tsx src/cli.ts dashboard` in a trip with some results
Expected: Formatted terminal output

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: dashboard, chart, and plan display commands"
```

---

## Task 15: Agent Mode

**Files:**
- Create: `src/commands/run-agent.ts`
- Modify: `src/generators/program.ts` — enhance with research strategy
- Modify: `src/commands/run.ts` — add --agent flag handling

**Step 1: Enhance program.md generator**

Update `src/generators/program.ts` to generate comprehensive agent instructions:
- Setup phase: read all files, score baseline
- Research phase: use agent-browser skill for Dianping/Xiaohongshu/Google Maps, fall back to WebSearch, then LLM knowledge
- Optimization loop: mutation types, git ratchet, scoring cadence
- Crash recovery: resume from results.tsv
- Context management: write to files, don't flood context

**Step 2: Implement agent launcher**

`src/commands/run-agent.ts`:
- Checks if `claude` CLI is available
- Generates/updates `program.md` in trip directory
- Launches: `claude --dangerously-skip-permissions -p "Read program.md and begin the optimization loop"`
- With `--safe` flag: omits `--dangerously-skip-permissions`
- Spawns as child process, pipes stdout/stderr

**Step 3: Wire up --agent flag in run command**

`src/commands/run.ts`:
```typescript
if (options.agent) {
  await launchAgent(tripDir, { safe: options.safe });
} else {
  await runOptimizationLoop({ ... });
}
```

**Step 4: Manual test**

Run: `npx tsx src/cli.ts run --agent` in a test trip (requires Claude Code installed)
Expected: Claude Code session launches, reads program.md, starts optimizing

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: agent mode — launches Claude Code with program.md in yolo mode"
```

---

## Task 16: Debrief Command & Memory Evolution

**Files:**
- Create: `src/commands/debrief.ts`
- Create: `src/memory/debrief-processor.ts`
- Create: `src/memory/learned-generator.ts`
- Create: `src/commands/history.ts`
- Modify: `src/cli.ts` — register commands

**Step 1: Implement debrief interactive session**

`src/commands/debrief.ts`:
- Reads `plan.md` to extract days and activities
- Walks through each day/activity with inquirer prompts:
  - Rating (1-5)
  - Surprise factor (better/expected/worse)
  - Optional notes
- Collects overall trip rating, surprises, skip-next-time
- Saves raw debrief data to `trip-history.json`

**Step 2: Implement debrief processor**

`src/memory/debrief-processor.ts`:
- Takes raw debrief data
- Computes activity calibration (expected vs actual scores)
- Updates source reliability stats
- Extracts new anti-patterns from "skip next time" answers

**Step 3: Implement learned.json generator**

`src/memory/learned-generator.ts`:
- Reads all past debriefs from `trip-history.json`
- Calls LLM to summarize patterns across all debriefs
- Generates `learned.json` with preference signals, activity calibration, source reliability
- Updates `profile.json` with learned vibes, learned anti-patterns

**Step 4: Implement history command**

`src/commands/history.ts`:
- Reads `trip-history.json`
- Shows list of past trips with ratings, dates, scores
- `trip-optimizer history <trip-name>` — detailed view of one trip's debrief

**Step 5: Register commands in CLI**

**Step 6: Manual test**

Run: `npx tsx src/cli.ts debrief` in a completed trip
Expected: Interactive walkthrough, data saved

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: debrief command with memory evolution and history"
```

---

## Task 17: Wire Learned Signals Into Rubric Generation

**Files:**
- Modify: `src/generators/rubrics.ts` — include learned.json in prompt
- Modify: `src/commands/init.ts` — load learned signals for returning users

**Step 1: Update rubric generator**

Modify `src/generators/rubrics.ts`:
- If `learned.json` exists, load it
- Include preference signals, activity calibration, and anti-patterns in the rubric generation prompt
- LLM uses these signals to adjust dimension weights, anchor descriptions, and penalty rules

**Step 2: Update init command**

Modify `src/commands/init.ts`:
- For returning users: display learned preferences summary before prompts
- Pre-populate anti-patterns from `profile.json.anti_patterns_learned`
- Show source trust data if available

**Step 3: Manual test**

Create a fake `learned.json` with some signals, run `init` for a new trip
Expected: Generated rubrics reflect the learned signals

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: learned signals feed into rubric generation for returning users"
```

---

## Task 18: Build, Package & Polish

**Files:**
- Modify: `package.json` — finalize metadata
- Create: `README.md`
- Modify: `src/cli.ts` — ensure all commands registered with descriptions

**Step 1: Finalize package.json**

```json
{
  "name": "trip-optimizer",
  "version": "0.1.0",
  "description": "Autonomously optimize travel plans using the autoresearch pattern",
  "bin": { "trip-optimizer": "./dist/cli.js" },
  "type": "module",
  "license": "MIT",
  "repository": { "type": "git", "url": "https://github.com/michaelpersonal/trip-optimizer" },
  "keywords": ["travel", "optimizer", "ai", "cli", "autoresearch"]
}
```

**Step 2: Configure tsup build**

Create `tsup.config.ts`:
```typescript
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  dts: true,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
});
```

**Step 3: Build and test**

Run: `npm run build && ./dist/cli.js --help`
Expected: Shows all commands

**Step 4: Create README.md**

Brief README with:
- One-line description
- Install: `npm install -g trip-optimizer`
- Quick start: `trip-optimizer init "Japan 2027"` → `trip-optimizer run`
- Command reference table
- How it works (autoresearch pattern, 3-pass scoring)
- Link to design doc

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: build config, README, ready for npm publish"
```

---

## Task Summary

| Task | What | Dependencies |
|------|------|--------------|
| 1 | Project scaffolding | None |
| 2 | Data layer (config, profile) | 1 |
| 3 | LLM provider abstraction | 1 |
| 4 | YAML schemas & trip scaffolding | 2 |
| 5 | `init` command | 2, 3, 4 |
| 6 | `config` and `profile` commands | 2 |
| 7 | Scoring — dimension scoring | 3 |
| 8 | Scoring — critic & holistic | 7 |
| 9 | Scoring — full scorer & comparative | 8 |
| 10 | `score` command | 9 |
| 11 | Mutations | 3 |
| 12 | Optimization loop & `run`/`status` | 9, 11 |
| 13 | `research` command | 3, 4 |
| 14 | Dashboard, chart, plan commands | 12 |
| 15 | Agent mode | 12 |
| 16 | Debrief & memory | 2, 3 |
| 17 | Wire learned signals into rubrics | 5, 16 |
| 18 | Build, package, polish | All |

### Parallelizable Groups

These tasks can be worked on simultaneously by independent agents:

- **Group A:** Tasks 2, 3 (data layer + LLM provider — no dependencies on each other)
- **Group B:** Tasks 6, 7, 11, 13 (after Group A — independent commands/modules)
- **Group C:** Tasks 8, 9, 10 (scoring pipeline — sequential)
- **Group D:** Tasks 14, 15, 16 (after Task 12 — independent features)

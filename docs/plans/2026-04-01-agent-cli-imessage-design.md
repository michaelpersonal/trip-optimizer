# Trip Optimizer Agent CLI & iMessage Integration Design

Date: 2026-04-01

## Overview

Trip Optimizer will be integrated with OpenClaw to provide a family-facing trip planning assistant via iMessage group chat. This document covers all changes needed on the Trip Optimizer side: structured plan data, trip registry, agent CLI commands, proposal lifecycle, migration utility, and bilingual output.

The OpenClaw side (BlueBubbles channel, intent classification, conversation memory, language routing) is covered in the companion architecture document.

## Architecture

```
iMessage -> OpenClaw (BlueBubbles) -> Trip Optimizer agent CLI -> canonical trip state
```

- OpenClaw handles: chat interaction, language detection, intent classification, approval flows, conversation memory
- Trip Optimizer handles: itinerary generation, scoring, mutation, persistence, proposal lifecycle
- Integration boundary: agent-native CLI with `--json` output mode

## Design Decisions

- **Trip registry**: global `~/.trip-optimizer/trips.json` maps trip IDs to directory paths. Trip directories stay where they are.
- **Dual plan format**: `plan.json` is the structured source of truth. `plan.md` is a derived artifact rendered deterministically from it.
- **Proposals as files**: `proposals/prop_<id>.json` in the trip directory. Git-friendly, inspectable, colocated.
- **Two mutation paths coexist**: `run` is autonomous autopilot (auto-apply). `propose`/`apply` is human-in-the-loop copilot. They share mutation and scoring internals.
- **Hybrid intent model**: direct overrides for specific requests ("change lunch to Din Tai Fung"), scoped re-optimization for vague requests ("something more local"). Intent classification happens inside the `propose` command.
- **Backward compatibility**: existing CLI commands keep working. `migrate` utility converts old trips.

## 1. Trip Registry & ID System

A global registry file at `~/.trip-optimizer/trips.json` maps trip IDs to their directory paths. Every trip gets a stable `trip_id`.

```json
{
  "trips": {
    "japan-2027": {
      "path": "/Users/mguo/trips/japan-2027",
      "title": "Japan Family Trip 2027",
      "created_at": "2026-04-01T...",
      "status": "active"
    }
  },
  "default_trip": "japan-2027"
}
```

- `trip-optimizer init <name>` creates the trip directory as today, plus registers it in the global registry with `name` as the `trip_id`.
- All new agent CLI commands accept `--trip <id>` to select a trip. If omitted, uses `default_trip` from the registry. If no default and no flag, falls back to `cwd` detection (backward compat).
- `trip-optimizer trip list --json` lists registered trips.
- `trip-optimizer trip set-default <id>` sets the default.

## 2. Structured Plan Data (`plan.json`)

Each trip directory gets a `plan.json` as the source of truth. `plan.md` becomes a derived artifact rendered from `plan.json`.

### Directory structure

```
my-trip/
  constraints.yaml      # unchanged
  rubrics.yaml          # unchanged
  activities_db.json    # unchanged
  plan.json             # NEW — structured source of truth
  plan.md               # now rendered from plan.json
  proposals/            # NEW — proposal files
  .gitignore
```

### `plan.json` schema

```json
{
  "version_id": "v_001",
  "parent_version_id": null,
  "created_at": "2026-04-01T...",
  "created_by": "optimizer",
  "score": {
    "composite": 82.5,
    "components": {}
  },
  "days": [
    {
      "day_index": 1,
      "date": "2027-05-28",
      "city": "Shanghai",
      "hotel": "Le Meridien",
      "transit": null,
      "segments": [
        {
          "id": "seg_001",
          "type": "activity",
          "period": "morning",
          "title": "Yu Garden Old Street",
          "details": "Walk through the historic bazaar...",
          "location": "Old City, Huangpu",
          "start_time": "09:00",
          "end_time": "11:30",
          "tags": ["cultural", "walking"]
        }
      ],
      "notes": ""
    }
  ]
}
```

### Code changes

- `generatePlan()` in `src/generators/plan.ts` — returns a structured `Plan` object. A new `renderPlanMarkdown(plan)` function generates `plan.md` from it.
- `generateMutation()` in `src/optimizer/mutations.ts` — operates on the `Plan` object. The LLM prompt includes the JSON plan, and the response is a modified JSON plan.
- `planCommand` in `src/commands/plan.ts` — reads `plan.json`, renders to terminal or PDF. Adds `--json` flag to output raw structured data.
- Scoring — serializes `plan.json` for scoring context.

### Version tracking

Every time the plan changes (optimizer loop or applied proposal), `version_id` increments and `parent_version_id` points to the previous version. Only the current version lives in `plan.json`. Git history provides the full version chain.

## 3. Proposal Lifecycle

A `proposals/` directory in each trip holds proposal files.

### Proposal file: `proposals/prop_<timestamp>_<short>.json`

```json
{
  "proposal_id": "prop_1711900800_local_lunch",
  "trip_id": "japan-2027",
  "base_version_id": "v_003",
  "status": "pending",
  "requested_by": "rachel",
  "requested_at": "2026-04-01T12:00:00Z",
  "request_language": "en",
  "raw_request": "Replace this lunch with something more local",
  "intent": "scoped_reoptimize",
  "scope": { "day_index": 3, "segment_id": "seg_012", "period": "lunch" },
  "candidate_plan": {},
  "impact_summary": {
    "changed_segments": ["seg_012"],
    "score_before": 82.5,
    "score_after": 83.1,
    "score_delta": 0.6,
    "tradeoffs": "Slightly longer walk between afternoon activity and new restaurant"
  },
  "explanation": {
    "en": "Replaced generic noodle shop with Jia Jia Tang Bao, a local soup dumpling spot...",
    "zh": "将普通面馆替换为佳家汤包..."
  }
}
```

### Lifecycle

1. **Create** — `trip-optimizer propose` generates the proposal. The mutation engine produces a candidate plan, scoring runs against it, and the proposal file is written with status `pending`.
2. **Inspect** — `trip-optimizer proposals` lists pending/recent proposals.
3. **Apply** — `trip-optimizer apply` promotes the candidate plan to `plan.json`, increments the version, re-renders `plan.md`, updates the proposal status to `applied`, and git commits.
4. **Reject** — `trip-optimizer reject` sets status to `rejected`. No plan change.

### Conflict detection

If `plan.json` has moved past the proposal's `base_version_id` (someone applied a different proposal first), the apply command fails with a `PROPOSAL_CONFLICT` error. The proposal must be regenerated against the current base.

## 4. Agent CLI Contract

### Global conventions

- **Exit codes**: 0 = success, 1 = user error (bad input, not found), 2 = system error (LLM failure, disk error)
- **`--json` flag**: when set, stdout is a single JSON object, no decorative output. Errors also emit JSON.
- **`--trip <id>` flag**: resolves trip from registry. If omitted, uses `default_trip`. If no default, tries `cwd` detection. If none found, error with code `NO_TRIP_CONTEXT`.
- **`--lang <code>`**: `en` or `zh`. Affects LLM output language. Defaults to trip's `locale_default` or `en`.
- **Stderr for progress**: when `--json` is set, all human-readable progress goes to stderr. Stdout is reserved for the JSON result.
- **Idempotency**: `apply` on an already-applied proposal returns success with the existing result. `reject` on an already-rejected proposal is a no-op success.

### Response envelope

Success:

```json
{
  "ok": true,
  "command": "trip.show",
  "trip_id": "japan-2027",
  "data": {}
}
```

Error:

```json
{
  "ok": false,
  "command": "trip.show",
  "error": {
    "code": "TRIP_NOT_FOUND",
    "message": "No trip registered with id 'japan-2027'",
    "hint": "Run 'trip-optimizer trip list --json' to see registered trips, or 'trip-optimizer migrate <path>' to register an existing trip directory"
  }
}
```

### Error codes with actionable hints

| Code | Message | Hint |
|---|---|---|
| `NO_TRIP_CONTEXT` | No trip context available | `Provide --trip <id> flag, or run 'trip-optimizer trip set-default <id>' to set a default, or run from a trip directory` |
| `TRIP_NOT_FOUND` | Trip ID not in registry | `Run 'trip-optimizer trip list --json' to see registered trips, or 'trip-optimizer migrate <path>' to register an existing trip` |
| `PROPOSAL_NOT_FOUND` | Proposal ID doesn't exist | `Run 'trip-optimizer proposals --trip <id> --json' to see available proposals` |
| `PROPOSAL_CONFLICT` | Plan has moved past proposal's base version | `Plan has changed since this proposal was created. Run 'trip-optimizer propose --trip <id> --request "<original request>" --json' to regenerate against the current plan` |
| `PROPOSAL_ALREADY_APPLIED` | Proposal was already applied | Idempotent success |
| `PROPOSAL_ALREADY_REJECTED` | Proposal was already rejected | Idempotent success |
| `NO_PLAN` | Trip exists but has no plan.json | `Run 'trip-optimizer run' in the trip directory to generate an initial plan, or 'trip-optimizer migrate <path>' if a plan.md already exists` |
| `LLM_ERROR` | Model call failed | `Check API key with 'trip-optimizer config' or retry. If using Vertex AI, run 'gcloud auth application-default login'` |
| `MIGRATION_FAILED` | Could not parse existing plan.md | `Ensure the directory contains a valid plan.md. Run 'trip-optimizer migrate <path> --verbose' for details` |
| `TRIP_ID_CONFLICT` | Trip ID already registered | `Run 'trip-optimizer migrate <path> --id <new-id>' to use a different trip ID` |

### Commands

**`trip-optimizer trip <subcommand>`** — trip management

- `trip list --json` — list registered trips
- `trip show --trip <id> [--day N] [--lang en|zh] --json` — show full plan or a specific day
- `trip set-default <id>` — set default trip for the CLI

**`trip-optimizer ask`** — read-only NL query

- `ask --trip <id> --question "What are we doing Friday night?" --lang en --json`
- LLM reads `plan.json`, answers the question, returns structured response
- No mutation, no confirmation needed
- Response: `{ "answer": "...", "referenced_days": [3], "referenced_segments": ["seg_012"], "language": "en" }`
- Stateless — no conversation memory. OpenClaw maintains chat context at its layer.
- Ambiguous questions get a clarifying response in the `answer` field, not an error.

**`trip-optimizer propose`** — create a change proposal

- `propose --trip <id> --request "..." [--requested-by name] [--lang en|zh] --json`
- Intent classification: `direct_override`, `scoped_reoptimize`, or `structural_change`
- Scope detection: identifies affected days/segments. If ambiguous, returns `status: "needs_clarification"` with options.
- Returns the full proposal object including score delta and bilingual explanation.

**`trip-optimizer apply`** — apply a pending proposal

- `apply --trip <id> --proposal <proposal_id> [--approved-by name] --json`
- Promotes candidate plan to `plan.json`, bumps version, re-renders `plan.md`, commits.
- Returns: updated version metadata, change summary, bilingual announcement payload.

**`trip-optimizer reject`** — reject a proposal

- `reject --trip <id> --proposal <proposal_id> --json`

**`trip-optimizer proposals`** — list proposals

- `proposals --trip <id> [--status pending|applied|rejected] --json`

**`trip-optimizer reoptimize`** — scoped optimization pass

- `reoptimize --trip <id> --scope "day:4" --goal "slower pace" [--lang en] --json`
- Scope syntax: `day:4`, `city:shanghai`, `period:dinner`, `segment:seg_012`
- Generates a proposal (not auto-applied), returns it for review.
- Differs from `propose`: driven by an optimization goal rather than a specific change request.

**`trip-optimizer migrate`** — one-time migration

- `migrate <path>` — registers existing trip, converts `plan.md` to `plan.json` via LLM

## 5. Migration Utility

`trip-optimizer migrate <path>` converts an existing trip directory to the new format and registers it.

### Steps

1. **Validate** — checks that `<path>` contains `constraints.yaml` and `plan.md`. If missing, fails with `MIGRATION_FAILED`.
2. **Derive trip ID** — uses the directory name. If that ID already exists in the registry, fails with `TRIP_ID_CONFLICT`.
3. **Parse `plan.md` into `plan.json`** — LLM-assisted. Sends the Markdown plan plus the `plan.json` schema to the model. Includes `constraints.yaml` for cross-reference.
4. **Validate parsed output** — schema validation on the returned JSON. Checks: every day has a date, segment IDs are unique, day count matches constraints. If validation fails, retries once with the validation errors fed back to the LLM.
5. **Write files** — writes `plan.json` to the trip directory. Creates empty `proposals/` directory. Does not overwrite `plan.md`. A fresh `plan.md` rendered from `plan.json` is written to `plan.rendered.md` so the user can diff and verify.
6. **Register** — adds the trip to `~/.trip-optimizer/trips.json`.
7. **Git commit** — commits `plan.json`, `proposals/`, and `plan.rendered.md` with message `"chore: migrate to structured plan format"`.

### Flags

- `--id <custom-id>` — override the auto-derived trip ID
- `--dry-run` — parse and validate but don't write anything, output the `plan.json` to stdout
- `--json` — structured output as per the standard envelope
- `--verbose` — show LLM parsing progress on stderr

### Verification

After migration, the user compares `plan.md` (original) against `plan.rendered.md` (rendered from parsed `plan.json`) to verify fidelity. If satisfied, replace with `mv plan.rendered.md plan.md`.

## 6. Optimizer Loop Adaptation

The existing `trip-optimizer run` loop switches from operating on `plan.md` Markdown to operating on `plan.json` structured data.

### Flow change

Current:
```
read plan.md -> LLM mutates Markdown -> score Markdown -> keep/discard -> write plan.md -> git commit
```

New:
```
read plan.json -> LLM mutates JSON plan -> score JSON plan -> keep/discard -> write plan.json -> render plan.md -> git commit
```

### Code changes

- `generateMutation()` — prompt changes to operate on JSON plan structure instead of Markdown.
- `generatePlan()` — returns a `Plan` object instead of a Markdown string.
- Scoring — receives serialized `plan.json` as context.
- Version bumping — each kept mutation increments `version_id` and sets `parent_version_id`. `created_by` is `"optimizer"`.
- Git commit — commits both `plan.json` and `plan.md` together.

### Unchanged

- `constraints.yaml`, `rubrics.yaml`, `activities_db.json` — untouched
- `results.tsv`, `score_history.jsonl` — same logging format
- `run` command flags (`--standalone`, `--headless`, `--safe`) — same behavior
- Research flow — unchanged

## 7. `plan.md` Rendering

`renderPlanMarkdown(plan: Plan): string` — deterministic, no LLM.

Produces:
1. YAML frontmatter (`trip_name`, `total_days`, `start_date`, `end_date`)
2. Schedule overview table (same 7-column format as today)
3. Day sections with `# Day N: City — Theme` headers
4. Period subsections: `## Morning`, `## Lunch`, `## Afternoon`, `## Dinner`, `## Evening`
5. Segment details under each period
6. `**Hotel:**` and `**Transit:**` footer lines

Re-rendered after: `apply`, `run` keep, `migrate`.

### Bilingual announcement payload

When `apply` returns, it includes an `announcement` field:

```json
{
  "announcement": {
    "en": "Plan updated: Day 3 lunch changed from Generic Noodle Shop to Jia Jia Tang Bao (local soup dumplings). Score +0.6. Requested by Rachel, approved by Michael.",
    "zh": "行程更新：第3天午餐从普通面馆改为佳家汤包（本地小笼包）。评分+0.6。Rachel 提议，Michael 批准。"
  }
}
```

LLM-generated during the `apply` step. OpenClaw posts both to the group chat.

## 8. File Map

### New files

| File | Purpose |
|---|---|
| `src/data/registry.ts` | Trip registry CRUD — read/write `~/.trip-optimizer/trips.json`, resolve trip by ID/default/cwd |
| `src/data/plan-schema.ts` | TypeScript types for `Plan`, `Day`, `Segment`, `Proposal`, registry entries |
| `src/data/plan-renderer.ts` | `renderPlanMarkdown(plan)` — deterministic JSON to Markdown |
| `src/commands/trip.ts` | `trip list`, `trip show`, `trip set-default` commands |
| `src/commands/ask.ts` | `ask` command — NL query against plan |
| `src/commands/propose.ts` | `propose` command — intent classification, candidate generation, scoring, proposal file write |
| `src/commands/apply.ts` | `apply` command — promote proposal, version bump, re-render, commit, bilingual announcement |
| `src/commands/reject.ts` | `reject` command — set proposal status to rejected |
| `src/commands/proposals.ts` | `proposals` command — list/filter proposals |
| `src/commands/reoptimize.ts` | `reoptimize` command — scoped optimization producing a proposal |
| `src/commands/migrate.ts` | `migrate` command — parse existing plan.md, write plan.json, register trip |
| `src/cli-utils/json-output.ts` | Shared envelope wrapper, error formatting with hints, stderr progress helpers |

### Modified files

| File | Change |
|---|---|
| `src/cli.ts` | Register all new commands |
| `src/data/schemas.ts` | Add Plan, Day, Segment, Proposal types (or import from `plan-schema.ts`) |
| `src/generators/plan.ts` | Return structured `Plan` object instead of Markdown string |
| `src/optimizer/mutations.ts` | Operate on `Plan` JSON instead of Markdown |
| `src/optimizer/loop.ts` | Write `plan.json` + render `plan.md`, bump version on keep |
| `src/scoring/scorer.ts` | Accept `Plan` object, serialize for LLM context |
| `src/commands/plan.ts` | Read from `plan.json`, add `--json` flag |
| `src/commands/status.ts` | Add `--json` flag |
| `src/commands/init.ts` | Register new trips in registry, create `proposals/` dir, generate `plan.json` |
| `src/data/trip.ts` | Scaffold includes `plan.json` and `proposals/` |

### Unchanged files

`src/commands/config.ts`, `src/commands/profile.ts`, `src/commands/research.ts`, `src/commands/debrief.ts`, `src/commands/history.ts`, `src/commands/chart.ts`, `src/commands/dashboard.ts`, `src/data/paths.ts`, `src/data/config.ts`, `src/data/profile.ts`, `src/i18n.ts`, `src/llm/*`, `src/scoring/prompts.ts`, `src/scoring/dimension-scorer.ts`, `src/scoring/holistic.ts`, `src/scoring/critic.ts`, `src/research/*`, `src/memory/*`

## Open Questions

- How should the system resolve references like "this", "that", or "the second restaurant" in a busy group chat? (OpenClaw layer responsibility)
- Should any family member be allowed to apply a pending proposal, or only the person who requested it?
- Should applied changes be instant after one approval, or should some categories require stronger confirmation?
- Do we want one active trip per chat only, or support switching between trips in the same family group?

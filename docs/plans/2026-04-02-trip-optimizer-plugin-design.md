# Trip Optimizer Plugin for OpenClaw — Design

Date: 2026-04-02

## Overview

A standalone OpenClaw tool plugin that bridges iMessage group chat to the Trip Optimizer CLI. The plugin registers discrete tools (one per CLI command), spawns `trip-optimizer <command> --json`, and returns structured results for the LLM to compose into natural chat responses.

No modifications to OpenClaw core. No modifications to BlueBubbles. The plugin is pure plumbing — all trip intelligence lives in the trip-optimizer CLI, all conversational intelligence lives in the LLM.

## Architecture

```
iMessage → BlueBubbles → OpenClaw agent → trip-optimizer-plugin tools → trip-optimizer CLI → trip state
                                    ↑                                            |
                                    └────────── structured JSON response ────────┘
```

## Design Decisions

- **Discrete tools over gateway**: One tool per CLI command (`trip_show`, `trip_ask`, `trip_propose`, etc.). The LLM naturally picks the right tool based on the message — no custom intent classification needed.
- **Light state caching**: The plugin remembers the active trip ID and version ID in memory. Tools inject `--trip` automatically so the LLM doesn't have to pass it every call. State resets on agent restart.
- **LLM handles approval flow**: When `trip_propose` returns a pending proposal, the LLM presents it to the group and waits for approval. No custom approval machinery — the LLM calls `trip_apply` or `trip_reject` based on the conversation.
- **LLM composes bilingual messages**: Tool descriptions instruct the LLM to include both English and Chinese when announcing applied changes. No rigid templates.
- **Local path plugin first**: Develop as a local directory plugin, publish to npm later if needed.

## 1. Project Structure

```
trip-optimizer-plugin/
  package.json              # name: @michaelpersonal/trip-optimizer-plugin
  openclaw.plugin.json      # id: "trip-optimizer", configSchema
  tsconfig.json             # target ES2022, module NodeNext
  src/
    index.ts                # definePluginEntry — registers all tools
    cli.ts                  # wrapper around runPluginCommandWithTimeout
    state.ts                # in-memory active trip ID + version
    tools/
      trip-list.ts          # trip list
      trip-show.ts          # trip show
      ask.ts                # ask
      propose.ts            # propose
      apply.ts              # apply
      reject.ts             # reject
      proposals.ts          # proposals list
      reoptimize.ts         # reoptimize
  tests/
    cli.test.ts
    state.test.ts
    tools/*.test.ts
```

### Config Schema (`openclaw.plugin.json`)

```json
{
  "id": "trip-optimizer",
  "name": "Trip Optimizer",
  "description": "Family trip planning assistant — propose, review, and apply itinerary changes",
  "configSchema": {
    "cli_path": {
      "type": "string",
      "description": "Path to trip-optimizer binary",
      "default": "trip-optimizer"
    },
    "timeout_ms": {
      "type": "number",
      "description": "CLI command timeout in milliseconds",
      "default": 120000
    }
  }
}
```

## 2. CLI Wrapper

`src/cli.ts` — standardizes all CLI calls through a single function:

```ts
import { runPluginCommandWithTimeout } from "openclaw/plugin-sdk/run-command";

type TripCLIResult = {
  ok: boolean;
  command: string;
  data?: any;
  error?: { code: string; message: string; hint: string };
  trip_id?: string;
};

async function runTripCLI(
  args: string[],
  config: { cliPath: string; timeoutMs: number }
): Promise<TripCLIResult> {
  const result = await runPluginCommandWithTimeout({
    argv: [config.cliPath, ...args, "--json"],
    timeoutMs: config.timeoutMs,
  });
  return JSON.parse(result.stdout);
}
```

Every tool calls `runTripCLI()`. The `--json` flag is always appended automatically.

## 3. State Management

`src/state.ts` — minimal in-memory state, reset on agent restart:

```ts
let activeTripId: string | null = null;
let activeVersionId: string | null = null;

function setActiveTrip(tripId: string, versionId: string) { ... }
function getActiveTrip(): string | null { ... }
function clearActiveTrip() { ... }
```

Auto-update: when any tool returns a successful response containing `trip_id` and `version_id`, state updates automatically.

Auto-inject: tools that need `--trip` check state first. If no explicit trip ID provided and an active trip exists, it's injected. If neither, error with hint: "Run trip_list to see available trips."

## 4. Tool Definitions

Each tool registers with `api.registerTool()` using `@sinclair/typebox` for parameter schemas.

| Tool Name | Parameters | CLI Command | Description |
|-----------|-----------|-------------|-------------|
| `trip_list` | (none) | `trip list` | List all registered trips |
| `trip_show` | `trip_id?`, `day?` | `trip show --trip <id> [--day N]` | Show trip plan, optionally filtered to a day |
| `trip_ask` | `question`, `trip_id?` | `ask --trip <id> --question <q>` | Ask a question about the trip |
| `trip_propose` | `request`, `requested_by?`, `trip_id?` | `propose --trip <id> --request <text>` | Propose a change (returns proposal for review) |
| `trip_proposals` | `status?`, `trip_id?` | `proposals --trip <id> [--status <s>]` | List proposals |
| `trip_apply` | `proposal_id`, `trip_id?` | `apply --trip <id> --proposal <pid>` | Apply a pending proposal |
| `trip_reject` | `proposal_id`, `trip_id?` | `reject --trip <id> --proposal <pid>` | Reject a proposal |
| `trip_reoptimize` | `scope`, `trip_id?` | `reoptimize --trip <id> --scope <s>` | Re-optimize a scoped portion |

All `trip_id` parameters are optional — injected from state if omitted.

### Tool Description Guidance

Tool descriptions guide the LLM's behavior:

- `trip_propose`: "Use this when someone wants to change something about the trip. The change is NOT applied immediately — it creates a proposal that must be approved first."
- `trip_apply`: "When announcing applied changes, always include both English and Chinese."
- `trip_ask`: "Use this for read-only questions about the trip — hotels, flights, timing, restaurants, etc."

## 5. Response Formatting & Error Handling

### Success responses

Tools pass the CLI's `data` payload directly to the LLM. The LLM composes chat messages naturally — no template formatting in the plugin.

### Proposal responses

- `status: "pending"` — tool result includes proposal summary, impact, score delta, and a note: "Present this to the group and ask if they'd like to apply or reject it."
- `status: "needs_clarification"` — tool result includes the clarification question and options: "Ask the user to pick one of these options."

### Error responses

The CLI's `hint` field is surfaced directly so the agent self-corrects:

```
Error: TRIP_NOT_FOUND
Message: No trip with ID "japn-2027"
Hint: Run trip_list to see available trips
```

The LLM sees the hint and calls `trip_list` automatically.

### Timeouts

LLM-heavy commands (`ask`, `propose`, `reoptimize`) use 180s timeout. On timeout: "The operation is taking longer than expected. Try again or simplify the request."

## 6. Dependencies

- `@sinclair/typebox` — tool parameter schemas
- `openclaw` — peerDependency (plugin SDK)
- No other external dependencies

## 7. Deployment

**Phase 1 (local):** Plugin lives as a directory on the same machine as OpenClaw. Referenced by path in OpenClaw config.

**Phase 2 (npm):** Publish as `@michaelpersonal/trip-optimizer-plugin` if distribution is needed.

## File Map

| File | Purpose | ~Lines |
|------|---------|--------|
| `src/index.ts` | Plugin entry, registers all 8 tools | 60 |
| `src/cli.ts` | `runTripCLI()` wrapper | 30 |
| `src/state.ts` | Active trip ID/version state | 25 |
| `src/tools/trip-list.ts` | trip list tool | 25 |
| `src/tools/trip-show.ts` | trip show tool | 35 |
| `src/tools/ask.ts` | ask tool | 35 |
| `src/tools/propose.ts` | propose tool (handles pending + clarification) | 45 |
| `src/tools/apply.ts` | apply tool (updates state on success) | 40 |
| `src/tools/reject.ts` | reject tool | 25 |
| `src/tools/proposals.ts` | proposals list tool | 30 |
| `src/tools/reoptimize.ts` | reoptimize tool | 35 |
| `tests/cli.test.ts` | CLI wrapper tests | 40 |
| `tests/state.test.ts` | State management tests | 30 |
| `tests/tools/*.test.ts` | Tool tests (~8 files) | 200 |
| **Total** | | **~655** |

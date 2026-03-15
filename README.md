# trip-optimizer

Autonomously optimize travel plans using the autoresearch pattern -- an AI-powered CLI that researches, scores, and iteratively improves your itinerary.

## Install

```bash
npm install -g trip-optimizer
```

Or run directly:

```bash
npx trip-optimizer
```

## Quick Start

```bash
trip-optimizer init "Japan 2027"
cd japan-2027
trip-optimizer run              # standalone mode
trip-optimizer run --agent      # Claude Code agent mode (default: yolo)
trip-optimizer dashboard --watch
```

## Commands

| Command | Description |
|---------|-------------|
| `init <name>` | Create a new trip project |
| `config` | Manage API keys and settings |
| `profile` | View travel profile |
| `score` | One-off absolute scoring |
| `research [city]` | Research sprint |
| `run` | Start optimization loop |
| `run --agent` | Launch as Claude Code agent |
| `status` | Show progress |
| `dashboard` | Live optimization dashboard |
| `chart` | ASCII score chart |
| `plan` | Pretty-print travel plan |
| `debrief` | Post-trip feedback |
| `history` | View past trips |

## How It Works

Trip-optimizer follows the **autoresearch pattern**: it autonomously researches destinations, generates plan mutations, scores results, and keeps only improvements. Each optimization iteration proposes targeted changes -- swapping a restaurant, adjusting timing, adding a hidden-gem activity -- then evaluates whether the change improved the overall plan. Bad mutations are discarded; good ones accumulate.

Scoring uses a **3-pass pipeline**. First, the plan is evaluated across seven weighted dimensions (experience, logistics, food, time management, budget, accommodation, and transit). Then an adversarial critic searches for concrete flaws -- unconfirmed bookings, chain restaurants, vague transit -- and applies penalties. Finally, a holistic adjustment reconciles the dimension scores with the critic's findings into a single composite score.

The system builds **persistent memory** across trips. After each trip, a debrief captures what worked and what didn't. These learnings are stored in `learned.json` and feed back into scoring rubrics and research priorities for future trips, so the optimizer gets smarter over time.

## Requirements

- Node.js 22+
- Anthropic API key (`ANTHROPIC_API_KEY` environment variable or configured via `trip-optimizer config`)

## License

MIT

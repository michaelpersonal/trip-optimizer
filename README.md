# trip-optimizer

Autonomously optimize travel plans using the autoresearch pattern -- an AI-powered CLI that researches, scores, and iteratively improves your itinerary.

Supports **English** and **中文（简体中文）** -- choose your language during setup and the entire experience adapts: prompts, generated plans, research queries, and scoring all work in your language.

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
trip-optimizer run              # agent mode (default, interactive Claude Code)
trip-optimizer run --standalone  # direct API calls
trip-optimizer run --headless    # agent mode, non-interactive
trip-optimizer dashboard --watch
trip-optimizer plan --pdf        # generate a formatted PDF itinerary
```

## Commands

| Command | Description |
|---------|-------------|
| `init <name>` | Create a new trip project |
| `config` | Manage API keys and settings |
| `profile` | View travel profile |
| `score` | One-off absolute scoring |
| `research [city]` | Research sprint |
| `run` | Start optimization loop (agent mode) |
| `run --standalone` | Optimization via direct API calls |
| `run --headless` | Agent mode, non-interactive |
| `status` | Show progress |
| `dashboard` | Live optimization dashboard |
| `chart` | ASCII score chart |
| `plan` | Pretty-print travel plan |
| `plan --pdf` | Generate a PDF document |
| `debrief` | Post-trip feedback |
| `history` | View past trips |

## How It Works

Trip-optimizer follows the **autoresearch pattern**: it autonomously researches destinations, generates plan mutations, scores results, and keeps only improvements. Each optimization iteration proposes targeted changes -- swapping a restaurant, adjusting timing, adding a hidden-gem activity -- then evaluates whether the change improved the overall plan. Bad mutations are discarded; good ones accumulate.

Scoring uses a **3-pass pipeline**. First, the plan is evaluated across seven weighted dimensions (experience, logistics, food, time management, budget, accommodation, and transit). Then an adversarial critic searches for concrete flaws -- unconfirmed bookings, chain restaurants, vague transit -- and applies penalties. Finally, a holistic adjustment reconciles the dimension scores with the critic's findings into a single composite score.

The system builds **persistent memory** across trips. After each trip, a debrief captures what worked and what didn't. These learnings are stored in `learned.json` and feed back into scoring rubrics and research priorities for future trips, so the optimizer gets smarter over time.

### Language & Localization

The first question during `init` is language selection. When **中文** is selected:

- All CLI prompts and messages display in Chinese
- Generated itineraries, rubrics, and plans are written in 简体中文
- Research prioritizes Chinese platforms (小红书、大众点评、马蜂窝、携程) over English-language sources
- Search queries use Chinese keywords (本地人推荐、避雷指南、苍蝇馆子) alongside English supplementary searches
- The PDF output renders Chinese text correctly

### Custom Model Support

During `init`, you can optionally configure a custom LLM instead of the default Anthropic/Vertex provider. Any OpenAI-compatible API works -- Kimi (Moonshot), DeepSeek, and others. Custom models run in `--standalone` mode; agent mode always uses Claude Code.

## Requirements

- Node.js 22+
- One of:
  - Anthropic API key (via `trip-optimizer config` or `ANTHROPIC_API_KEY`)
  - Google Cloud Vertex AI (`CLAUDE_CODE_USE_VERTEX=1` + `GOOGLE_CLOUD_PROJECT`)
  - Custom OpenAI-compatible API (configured during `init`)

## License

MIT

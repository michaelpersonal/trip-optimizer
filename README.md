# trip-optimizer

Autonomously optimize travel plans using the autoresearch pattern -- an AI-powered CLI that researches, scores, and iteratively improves your itinerary.

支持 **English** 和 **中文（简体中文）** -- 在初始化时选择语言，整个体验随之适配：提示语、生成的行程、研究搜索、评分系统全部使用您选择的语言。

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

### 语言与本地化

`init` 的第一个问题是语言选择。选择 **中文** 后：

- 所有命令行提示和消息以中文显示
- 生成的行程、评分标准和计划均以简体中文撰写
- 研究优先使用中文平台（小红书、大众点评、马蜂窝、携程），而非英文来源
- 搜索关键词使用中文（本地人推荐、避雷指南、苍蝇馆子），同时辅以英文补充搜索
- PDF 输出正确渲染中文内容

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

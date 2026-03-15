# trip-optimizer Design Doc

**Date:** 2026-03-15
**Author:** Michael + Claude
**Status:** Draft
**Inspired by:** [karpathy/autoresearch](https://github.com/karpathy/autoresearch), [china-trip auto-optimizer](../../../china-trip/)

---

## Problem

Planning a great trip is hard. Most travel plans are either generic (copy-paste from TripAdvisor) or require weeks of manual research. AI can generate a decent plan in seconds, but it can't tell if the plan is actually *good* — it has no feedback loop, no scoring, no iteration.

## Solution

**trip-optimizer** is an open-source TypeScript CLI that autonomously optimizes travel plans using the autoresearch pattern: **research, mutate, score, keep/discard**. It builds a research database, generates a baseline plan, then iteratively improves it through hundreds of small mutations evaluated by an LLM-as-judge scoring engine.

What makes it different:
- **Persistent memory** — learns your real preferences across trips, not just what you say you like
- **Adversarial scoring** — a critic actively looks for flaws (tourist traps, unrealistic logistics, generic restaurants)
- **Post-trip debriefs** — feedback from completed trips calibrates future scoring
- **Pluggable research** — browser automation > web search API > LLM knowledge fallback

### Core Insight from Autoresearch

The autoresearch pattern works because of five properties:
1. **Constrained search space** — the agent can only edit one thing per iteration
2. **Clear scalar metric** — unambiguous "better" or "worse"
3. **Autonomous loop** — no human in the loop per iteration
4. **Ratchet** — gains are captured, losses are discarded via git reset
5. **Growing knowledge** — each iteration compounds on previous work

---

## Architecture Overview

### Three Layers

```
+-------------------------------------+
|  CLI Layer (trip-optimizer)          |  npm package, user-facing
|  init, run, status, debrief, etc.   |
+-----------------+-------------------+
|  Engine Layer                        |  optimization loop, scoring, mutations
|  LLM scoring, adversarial critic,   |
|  rubric generation, research         |
+-----------------+-------------------+
|  Data Layer                          |  git-backed trips + local profile
|  ~/.trip-optimizer/  (global)        |
|  ./trip-project/     (per-trip git)  |
+-------------------------------------+
```

### Two Run Modes

1. **Standalone** — `trip-optimizer run` executes the optimization loop directly via LLM API calls. No dependencies beyond Node + API key. Good for overnight batch runs.
2. **Agent mode** — `trip-optimizer run --agent` generates a `program.md` and launches a Claude Code session in yolo mode (dangerously-skip-permissions) by default for unattended operation. Full agentic experience with browser research, richer tool use. Use `--safe` flag for normal permissions.

### Technology

- **Runtime:** Node.js / TypeScript
- **Package:** npm (`trip-optimizer`)
- **LLM:** BYOK (Bring Your Own Key) — Anthropic-first, clean provider abstraction for adding others later
- **Version control:** git-backed per-trip projects
- **CLI framework:** commander or yargs

---

## Persistent Memory

### Global Profile: `~/.trip-optimizer/`

```
~/.trip-optimizer/
  config.json          # API keys, default provider
  profile.json         # loyalty programs, dietary, vibe preferences, anti-patterns
  trip-history.json    # past trips with debrief ratings
  learned.json         # accumulated preference signals from debriefs
```

#### config.json

```json
{
  "provider": "anthropic",
  "api_key": "sk-ant-...",
  "search_api": {
    "provider": "tavily",
    "api_key": "tvly-..."
  }
}
```

#### profile.json

```json
{
  "loyalty_program": "marriott_bonvoy",
  "dietary": ["no shellfish"],
  "stated_vibes": ["wandering", "food", "culture"],
  "learned_vibes": ["wandering", "street_food", "back_alleys"],
  "anti_patterns": ["glass bridges", "observation decks", "2hr+ queues"],
  "anti_patterns_learned": ["museums after 3pm", "hotel buffet breakfast"],
  "source_trust": { "dianping_4.8+": 0.92, "llm_knowledge": 0.68 },
  "trips_completed": 3,
  "last_debrief": "2027-04-15"
}
```

#### learned.json

Accumulated signals extracted by LLM from all past debriefs:

```json
{
  "preference_signals": [
    { "signal": "user skipped every museum, loved every street food stop", "trips": ["china-2026"] },
    { "signal": "user rated unstructured wandering 5/5 three times — #1 activity type", "trips": ["china-2026", "japan-2027"] },
    { "signal": "prefers guesthouses over loyalty hotels (4.8 vs 4.5 avg)", "trips": ["china-2026"] }
  ],
  "activity_calibration": [
    { "type": "hiking", "expected_score": 8, "actual_rating": 3, "delta": -5, "note": "says they like hiking but doesn't in practice" },
    { "type": "night_market", "expected_score": 7, "actual_rating": 9, "delta": 2 }
  ],
  "source_reliability": {
    "dianping_4.8+": { "avg_delta": 0.5, "n": 12 },
    "llm_knowledge": { "avg_delta": -1.2, "n": 8 },
    "xiaohongshu": { "avg_delta": 0.3, "n": 5 }
  },
  "anti_patterns_learned": [
    "glass bridge attractions",
    "any activity with 2hr+ queue"
  ]
}
```

### Memory Compounding Across Trips

```
Trip 1: profile.json has what user SAID they like
Trip 3: profile.json corrected by what user ACTUALLY likes (from debriefs)
Trip 5: scoring rubrics are deeply personalized, optimizer knows the user
```

The LLM-generated rubric for trip N includes learned signals from trips 1 through N-1, producing a scoring system calibrated to the user before iteration 1 even runs.

---

## Per-Trip Project Structure

`trip-optimizer init "Japan 2027"` scaffolds a git repo:

```
japan-2027/
  constraints.yaml      # trip params, cities, preferences     [user edits]
  rubrics.yaml           # LLM-generated scoring dimensions     [generated, user can tweak]
  plan.md                # the itinerary being optimized         [agent edits]
  activities_db.json     # researched activities per city        [agent builds]
  program.md             # agent operating instructions          [generated]
  results.tsv            # experiment log                        [gitignored]
  score.json             # latest score output                   [generated]
  .gitignore             # results.tsv, node_modules, etc.
```

### Generated Files from `init`

1. **`constraints.yaml`** — Built from interactive Q&A (dates, cities, budget, travelers, vibe, loyalty program, dietary restrictions, anti-patterns). For returning users, pre-populated from global profile.
2. **`rubrics.yaml`** — LLM generates custom scoring dimensions + anchors tailored to this trip type. Includes learned signals from past debriefs. Uses the China trip rubric as a seed example in the prompt.
3. **`plan.md`** — LLM generates an initial baseline itinerary from the constraints.
4. **`program.md`** — Generated agent instructions with research strategy (browser > search > LLM fallback) and mutation rules. Adapted based on available tools.

All four files committed as the initial git commit. User reviews and can edit before running the optimizer.

### constraints.yaml Example

```yaml
trip:
  name: "Japan 2027"
  start_date: 2027-03-15
  end_date: 2027-03-28
  total_days: 14
  travelers: 2
  origin: Atlanta

cities:
  - name: Tokyo
    key: tokyo
    min_days: 3
    max_days: 6
  - name: Kyoto
    key: kyoto
    min_days: 2
    max_days: 4
  - name: Osaka
    key: osaka
    min_days: 2
    max_days: 4

hard_requirements:
  - City ordering cannot change

preferences:
  priority_order: [wandering, food, culture]
  anti_patterns:
    - tourist traps
    - long queues
  pro_patterns:
    - back-alley local spots
    - neighborhood wandering
    - seasonal specialties

dietary: []
loyalty_program: marriott_bonvoy
budget:
  total: 8000
  currency: USD
```

---

## Pluggable Research Architecture

The research phase builds `activities_db.json` with scored activities, restaurants, neighborhoods, and tourist traps per city.

### Source Priority

```
1. Browser automation (agent-browser skill)
   - Best quality: real ratings, real reviews, real-time data
   - Only available in agent mode (Claude Code)
   - Sites: Google Maps, Dianping, Xiaohongshu, TripAdvisor
   - program.md instructs agent to invoke agent-browser skill for scraping

2. Web search API (Tavily, Serper, etc.)
   - Good quality: aggregated results, recent data
   - Configured via ~/.trip-optimizer/config.json
   - Queries: "[city] hidden gems", "[city] seasonal food"

3. LLM knowledge (always available)
   - Decent for major destinations, weaker for obscure ones
   - Zero additional cost beyond scoring calls
   - Entries tagged source: "llm_knowledge" for lower trust weighting
```

### Research Strategy in `program.md`

The generated `program.md` adapts research instructions to what's available:

- **Agent mode + browser**: Instructions to invoke `agent-browser` skill for Dianping/Xiaohongshu/Google Maps scraping per city
- **Agent mode, no browser**: Instructions to use WebSearch tool if available, LLM fallback if not
- **Standalone mode**: LLM knowledge only (no tool use), but user can pre-populate `activities_db.json` manually or from a previous trip

### Activities Database Schema

```json
{
  "city_key": {
    "activities": [
      {
        "name": "Yanaka Old Town wandering",
        "name_local": "",
        "type": "vibe",
        "score": 8,
        "authenticity": 9,
        "uniqueness": 7,
        "notes": "Quiet old neighborhood, cat streets, traditional shops",
        "crowd_level": "low",
        "cost_per_person": 0,
        "currency": "JPY",
        "duration_hours": 2,
        "location": "Yanaka, Taito-ku",
        "best_time": "morning",
        "seasonal": null,
        "source": "dianping"
      }
    ],
    "restaurants": [
      {
        "name": "Fuunji",
        "name_local": "",
        "cuisine": "tsukemen ramen",
        "score": 9,
        "authenticity": 9,
        "notes": "Legendary dipping ramen. 30 min queue but worth it.",
        "cost_per_person": 1200,
        "currency": "JPY",
        "location": "Shinjuku",
        "reservation_needed": false,
        "source": "google_maps"
      }
    ],
    "neighborhoods_for_wandering": [
      {
        "name": "Shimokitazawa",
        "vibe_score": 9,
        "walkability": "excellent",
        "notes": "Vintage shops, tiny bars, live music venues, no chains"
      }
    ],
    "tourist_traps": [
      {
        "name": "Robot Restaurant",
        "reason": "Overpriced, gimmicky, shut down and reopened as tourist-only"
      }
    ],
    "seasonal_highlights": [
      "Cherry blossom peak mid-March to early April — Meguro River, Shinjuku Gyoen"
    ]
  }
}
```

Each entry tracks its source so the scorer can weight browser-verified data higher than LLM guesses.

---

## Scoring Engine

Three-pass LLM-as-judge architecture, ported from the China trip's `scoring_v2.py` to TypeScript.

### Pass 1: Dimension Scoring

For each dimension in `rubrics.yaml`, send the plan + rubric anchors to the LLM. Get per-sub-dimension scores (0-100) with one-sentence justifications.

Dimensions are **not hardcoded** — they come from the LLM-generated `rubrics.yaml`. A solo backpacking trip might have `social_opportunities` instead of `accommodation_quality`. But the engine structure is always the same: dimensions, sub-dimensions, anchor descriptions, scores.

### Pass 2: Adversarial Critic

Separate LLM call that only looks for flaws. Penalty rules also come from `rubrics.yaml`. Returns a list of specific violations with day numbers and point deductions, capped per dimension (default: -20 max per dimension).

### Pass 3: Holistic Cross-Dimension

Reviews all dimension scores together, catches interactions one judge missed. Example: "food scored high but logistics shows a 10hr transit day — that's actually smart station food integration, bump food +2." Adjustments capped at +/-5 per dimension.

### Two Scoring Modes

- **Absolute** — Full three-pass scoring. Used every N iterations for recalibration (default: every 10).
- **Comparative** — Pairwise diff between old and new plan. Only scores affected sub-dimensions. Cheaper, faster, used for most iterations.

### Composite Score

```
score = sum(dimension_weight * dimension_score)
```

Weights come from `rubrics.yaml`, generated per trip. Single scalar determines keep/discard.

### Provider Abstraction

```typescript
interface LLMProvider {
  complete(prompt: string, maxTokens: number): Promise<string>
}
```

Ships with `AnthropicProvider`. Clean interface for adding OpenAI, Google, local models later.

### How Past Trip Feedback Feeds Into Scoring

```
Debrief (trip N)
    |
learned.json (accumulated signals)
    |
Rubric generation prompt (trip N+1)
    |
Custom rubrics.yaml with calibrated anchors + penalties
    |
Scoring engine uses calibrated rubrics
```

The rubric generation prompt for trip N includes all learned signals from trips 1 through N-1:
- Activities the user loved boost similar activity types in scoring anchors
- Activities they hated become adversarial penalty rules
- Source reliability data weights research sources differently
- Stated vs actual preference gaps are corrected

---

## Optimization Loop

The core autoresearch ratchet.

### Mutation Types

```
SWAP       — Replace an activity with a higher-scored alternative from activities_db
REALLOCATE — Move a day between cities (within min/max bounds)
REORDER    — Rearrange a day's activities for better geographic clustering
UPGRADE    — Replace a restaurant with a more authentic option
SIMPLIFY   — Remove a low-scoring activity, leave free wandering time
RESEARCH   — Discover new options for the weakest-scoring city, then attempt a swap
```

### Loop Logic

```
1. Pick mutation type (rotate, or RESEARCH if 5+ consecutive discards)
2. LLM generates the specific mutation
3. Apply change to plan.md
4. Git commit
5. Score (comparative mode, absolute every 10th iteration)
6. If improved -> keep commit
7. If same or worse -> git reset to previous best
8. Log to results.tsv
9. Repeat forever until interrupted (Ctrl+C)
```

### Standalone vs Agent Mode

| | Standalone | Agent |
|---|---|---|
| Mutations | LLM API call generates diff | Claude Code agent edits plan.md directly |
| Research | LLM knowledge only | Browser + search + LLM |
| Git ops | Programmatic (simple-git) | Agent runs git commands |
| Speed | Faster (no tool overhead) | Slower but richer |
| Permissions | N/A | Yolo mode by default, --safe for guardrails |
| Typical use | Overnight batch run | Interactive exploration |

### Crash Recovery

- `results.tsv` is gitignored — survives git resets
- On restart, reads `results.tsv` to find last best score and iteration count
- Picks up where it left off, avoids repeating failed mutations

---

## Dashboard & Monitoring

### `trip-optimizer dashboard`

Live-updating terminal dashboard, refreshes every iteration:

```
+-- trip-optimizer: Japan 2027 --------------- iteration 47 --+
|                                                              |
|  Score: 86.7/100  (+5.4 from baseline)                       |
|                                                              |
|  Dimensions          Score   Trend                           |
|  experience_quality   89.2   ^^^                             |
|  logistics            84.1   ^                               |
|  food                 91.0   ^^                              |
|  time_allocation      85.3   -                               |
|  budget               88.0   ^                               |
|                                                              |
|  Last 5 mutations                                            |
|  + UPGRADE  Day 5 dinner -> Tsukiji omakase         +0.8    |
|  x SWAP     Day 3 temple -> garden walk              -0.2    |
|  + SIMPLIFY Day 7 remove shopping, add wander        +0.5    |
|  x REORDER  Day 2 flip morning/afternoon             -0.1    |
|  + RESEARCH Osaka -> found 6 new activities          +1.2    |
|                                                              |
|  Research Coverage                                           |
|  Tokyo  ==================== 18                              |
|  Kyoto  ======================== 22                          |
|  Osaka  ========= 9  <- needs research                      |
|                                                              |
|  Penalties: 3 remaining   Uptime: 2h 14m   Rate: 1.2/min   |
+--------------------------------------------------------------+
```

### `trip-optimizer chart`

Generates `progress.png` with four panels:

1. **Composite score over time** — main optimization curve, kept iterations as line, discards as faded dots
2. **Sub-score breakdown** — multi-line chart per dimension over time
3. **Day allocation over time** — horizontal stacked bars showing how city days shift
4. **Research coverage** — bar chart of activities_db entries per city

Both commands read from `results.tsv` and `score.json` — no extra state needed.

---

## Post-Trip Debrief

### `trip-optimizer debrief`

Interactive walkthrough after a completed trip:

```
Day 1: Tokyo — Arrival + Shinjuku evening walk
  Shinjuku backstreet wandering    Rating (1-5): 5   better/expected/worse? better
  Dinner at Omoide Yokocho         Rating (1-5): 4   better/expected/worse? expected
  Notes? "the alley two blocks east of the main strip was incredible"

Day 2: Tokyo — Tsukiji + Yanaka
  ...

Overall trip rating (1-5): 5
What surprised you most? "How much better unplanned wandering was vs scheduled stuff"
Would you visit again? yes/maybe/no: maybe
What would you skip next time? "Skytree -- tourist trap, we knew it, still went"
```

### Data Flow

```
Debrief answers
    |
trip-history.json    — raw ratings per activity, stored with trip
    |
learned.json         — LLM summarizes patterns across ALL debriefs
    |
profile.json         — updated anti-patterns, vibe preferences, source trust
```

The LLM summarization step is key — after each debrief, it reads all past debriefs and regenerates `learned.json` with updated signals. This catches patterns the user might not articulate:

- "Rated street food 4.8 avg across 3 trips, sit-down restaurants 3.9 avg"
- "Always skips the last activity of the day — schedule lighter evenings"
- "Rates rainy day activities higher than expected — doesn't mind rain"

---

## CLI Command Reference

```
trip-optimizer                        # show help
trip-optimizer --help                 # show help
trip-optimizer help [command]         # help for specific command

trip-optimizer init <name>            # interactive setup, scaffolds git repo
trip-optimizer run                    # standalone optimization loop
trip-optimizer run --agent            # Claude Code agent mode (yolo by default)
trip-optimizer run --agent --safe     # agent mode with normal permissions
trip-optimizer status                 # current score, iteration, last mutation
trip-optimizer dashboard              # live terminal dashboard
trip-optimizer chart                  # generate progress.png
trip-optimizer score                  # one-off absolute score
trip-optimizer plan                   # render current plan as readable output
trip-optimizer research <city>        # research sprint for one city
trip-optimizer profile                # view/edit global preferences
trip-optimizer history                # show past trips and ratings
trip-optimizer debrief                # post-trip feedback session
trip-optimizer config                 # manage API keys, providers
```

---

## User Journeys

### First-Time User

```
$ npm install -g trip-optimizer
$ trip-optimizer init "Japan 2027"

  Welcome to trip-optimizer!

  First time? Let's set up your profile.
  API key (Anthropic): sk-ant-...  saved
  Hotel loyalty program: Marriott Bonvoy
  Dietary restrictions: none

  Now let's plan your trip.
  Dates: 2027-03-15 to 2027-03-28
  Travelers: 2 (couple)
  Cities: Tokyo -> Kyoto -> Osaka
  Budget: $8000
  Pick your vibes (3): wandering, food, culture
  Anything to avoid? "tourist traps, long queues"

  Generating constraints... done
  Generating scoring rubrics... done
  Generating initial plan... done

  Created japan-2027/ with 4 files. Initial commit done.
  Review constraints.yaml and rubrics.yaml, then run:
    cd japan-2027 && trip-optimizer run

$ cd japan-2027
$ trip-optimizer run

  Scoring baseline... 72.4/100
  Starting optimization loop (Ctrl+C to stop)

  [1] RESEARCH Tokyo -> 14 activities found
  [2] SWAP Day 2: Meiji Shrine -> Yanaka Old Town  +1.2  keep
  [3] UPGRADE Day 4 dinner -> Pontocho alley izakaya  +0.8  keep
  [4] REORDER Day 3 -> geographic clustering  +0.3  keep
  ...
```

### Returning User (Trip #3)

```
$ trip-optimizer init "Portugal 2028"

  Welcome back! Using your profile (3 past trips, last debrief: 2027-11-20)

  Based on your history, I know you:
  - Love unstructured wandering (rated 4.9 avg)
  - Prefer street food over sit-down (4.8 vs 3.9 avg)
  - Skip museums after 3pm
  - Marriott Bonvoy member, but actually prefer guesthouses (4.8 vs 4.5)

  Dates: ...
```

### Post-Trip

```
$ trip-optimizer debrief

  Let's review your Japan 2027 trip!

  Day 1: Tokyo -- Arrival + Shinjuku
    Shinjuku backstreet wandering  Rating (1-5): 5  Surprise: better
    ...

  Saving debrief... done
  Updating learned preferences... done

  Key insights from this trip:
  - You rated wandering activities 4.8 avg (consistent with past trips)
  - Tsukiji scored 5/5 -- adding "early morning food markets" to your pro patterns
  - You skipped the Kyoto temple on Day 6 -- adjusting temple scoring down

  Profile updated. These insights will improve your next trip's scoring.
```

---

## Implementation Plan

### Phase 1: Foundation
- Set up TypeScript project with npm packaging
- CLI scaffolding with commander
- `init` command with interactive prompts
- Global profile and config management
- Git repo scaffolding for new trips

### Phase 2: Scoring Engine
- LLM provider abstraction (Anthropic first)
- Rubric generation from constraints + profile
- Three-pass scoring (dimensions, adversarial, holistic)
- Comparative scoring mode
- `score` command

### Phase 3: Optimization Loop
- Mutation generation (all 6 types)
- Git-backed ratchet (commit, score, keep/reset)
- `results.tsv` logging
- Crash recovery
- `run` command (standalone mode)
- `status` command

### Phase 4: Dashboard & Monitoring
- Terminal dashboard with live updates
- Chart generation (progress.png)
- `dashboard` and `chart` commands

### Phase 5: Research Layer
- LLM knowledge research (standalone)
- Web search API integration
- `research` command

### Phase 6: Agent Mode
- `program.md` generation
- Claude Code launch with yolo mode
- Browser research instructions in program.md
- `run --agent` command

### Phase 7: Debrief & Memory
- `debrief` command with interactive walkthrough
- `learned.json` generation from debrief data
- Profile evolution from accumulated debriefs
- Learned signals fed into rubric generation
- `history` command

### Phase 8: Polish & Open Source
- README with examples and demo GIFs
- `trip-optimizer --help` for all commands
- npm publish
- GitHub repo with MIT license
- Example trip projects in repo

---

## What You Wake Up To

You run `trip-optimizer run` before bed and open your laptop in the morning:

1. **`trip-optimizer status`** — score went from 72 to 87 overnight, 94 iterations
2. **`trip-optimizer dashboard`** — see which dimensions improved, what mutations worked
3. **`trip-optimizer plan`** — read the optimized itinerary, better than when you went to sleep
4. **`activities_db.json`** — all the research the agent did, scored and sourced
5. **`git log`** — every kept mutation as a clean commit with a descriptive message

---

*Lineage: This design extends the [auto-trip-optimizer](../../../china-trip/docs/plans/2026-03-14-auto-trip-optimizer-design.md) built for a 19-day China/Japan/Taiwan trip (173 optimization iterations, 83.4/100 final score) and the [travel-planner skill](../../../china-trip/.agents/skills/travel-planner/SKILL.md) (preference persistence, budget tracking, packing checklists, cultural etiquette). trip-optimizer combines the optimizer's autoresearch engine with the planner's lifecycle management into a single open-source tool.*

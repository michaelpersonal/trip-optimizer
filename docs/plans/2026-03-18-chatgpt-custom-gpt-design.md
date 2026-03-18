# trip-optimizer: ChatGPT Custom GPT Design

**Date:** 2026-03-18
**Author:** Michael + Claude
**Status:** Draft
**Builds on:** [trip-optimizer CLI design](./2026-03-15-trip-optimizer-design.md)

---

## Problem

The trip-optimizer CLI requires `npm install -g`, an Anthropic API key, and comfort with terminal commands. The users who would benefit most from AI-optimized travel plans — regular travelers — can't get past this setup barrier. They have ChatGPT subscriptions, they know how to chat with AI, but they've never opened a terminal.

## Solution

A **Custom GPT** that brings the full optimization loop into a ChatGPT conversation. No backend, no API keys, no install. User clicks a link and starts planning.

The core value proposition is unchanged: research, mutate, score, keep/discard. The interface changes from CLI to conversation.

### Tiered Approach

| Tier | Interface | Optimization | Audience |
|------|-----------|-------------|----------|
| **Conversational** | Custom GPT | 5-10 rounds per session, multi-session | Everyone with ChatGPT |
| **Batch** | Codex handoff | 100+ iterations, unattended | Users willing to try Codex |
| **Power user** | CLI (`trip-optimizer`) | Overnight runs, full control | Developers |

All three tiers use the same optimization philosophy — same mutation types, same adversarial scoring, same ratchet logic. They differ only in interface and iteration count.

---

## Architecture

### Zero Infrastructure

The entire product is a single Custom GPT configuration:
- A system prompt (~2000-3000 tokens) encoding optimization logic, scoring, and save/restore protocol
- Conversation starters for common entry points
- No GPT Actions, no backend, no database, no external API calls

### State Management: The Save Block

Multi-session optimization with zero infrastructure is solved by **save blocks** — compact, portable text blobs that encode the full trip state. The user holds the state.

```
===TRIP-SAVE===
trip: Japan 2027 | 2027-03-15 to 2027-03-28 | 2 pax | $8000
cities: Tokyo(4d) -> Kyoto(3d) -> Osaka(3d)
vibes: wandering, food, culture
anti: tourist traps, long queues
loyalty: marriott_bonvoy | dietary: none
iter: 18 | score: 82.1 | baseline: 68.3

RUBRIC: experience:30,logistics:15,food:20,time:15,budget:10,accommodation:10
PENALTIES: -3/unconfirmed-transit, -5/chain-restaurant, -3/vague-booking

PLAN:
D1|Tokyo|Arrive NRT->Shinjuku|Omoide Yokocho dinner|walk Kabukicho
D2|Tokyo|Tsukiji morning|Yanaka backstreets|Shimokitazawa evening
...
D10|Osaka|Shinsekai morning|Dotonbori food crawl|depart KIX

SCORE_HISTORY: 68.3,70.1,70.1,72.4,74.0,76.2,76.2,78.4,80.0,82.1
KEPT_MUTATIONS: swap:6,upgrade:2,simplify:3,reorder:1
===END-SAVE===
```

**Design choices:**
- Pipe-delimited, abbreviated — minimizes token count
- Human-scannable — user can glance at it and see their trip
- Score history included — optimization curve continues across sessions
- Rubric + penalty rules included — scoring stays consistent
- No activities DB — too large; the GPT re-researches as needed each session

### In-Conversation Optimization

The GPT operates as a state machine. Each optimization cycle within a single message:
1. Generate a mutation (swap, upgrade, reorder, simplify)
2. Apply it to the plan held in context
3. Single-pass score (dimensions + adversarial penalties in one structured output)
4. Compare to previous score — keep or revert
5. Report result

When the user says "optimize," the GPT runs multiple cycles in a single response:

```
Optimizing... 8 rounds complete
  Swapped Day 3 temple -> Yanaka backstreet walk       +1.2
  Tried upgrading Day 5 dinner -> omakase              -0.3 (reverted)
  Simplified Day 7, added free wandering time           +0.8
Score: 78.4 -> 82.1 (+3.7)
```

### Scoring: Single-Pass vs. Three-Pass

The CLI uses a 3-pass scoring engine (dimension scoring, adversarial critic, holistic review). In-conversation, this is collapsed to **single-pass scoring** — all three concerns in one structured prompt. This uses 1 turn per score instead of 3, allowing more optimization rounds per session.

Full 3-pass scoring is reserved for the Codex batch handoff where turn count doesn't matter.

---

## User Journey

### Session 1: Setup + First Optimization

1. User opens the Custom GPT, says "I want to plan a trip to Japan"
2. GPT asks 5-6 questions one at a time (dates, cities, budget, travelers, vibes, dietary/loyalty)
3. GPT generates initial plan + scoring rubric
4. GPT scores the plan (single-pass), shows the score
5. GPT runs 5-10 optimize cycles automatically
6. Shows the improved plan + what changed
7. User can say "keep optimizing" for more rounds, or make specific requests
8. At end of session, GPT outputs a save block: "Copy this to resume next time"

### Session 2+: Resume + Continue

1. User pastes the save block
2. GPT reconstructs state, shows current plan + score
3. More optimization rounds, user feedback, manual tweaks
4. Updated save block at the end

### Optional: Codex Power-Up

1. User asks "how do I optimize this overnight?" or GPT offers it
2. GPT generates a single self-contained Codex prompt with full state embedded
3. Step-by-step guide: "Click Codex in the sidebar, start a new task, paste this"
4. Codex runs 100+ iterations, outputs an optimized save block
5. User pastes the save block back into the Custom GPT to continue conversationally

---

## Codex Handoff

The GPT generates a self-contained prompt for Codex:

```
Want to optimize overnight? Here's how:

1. Click "Codex" in the ChatGPT left sidebar
2. Start a new task
3. Paste everything below and hit Run

---
[CODEX TASK START]
You are a trip optimization engine. Below is a trip in progress.
Run 100 optimization iterations using these rules:

CURRENT STATE:
(full save block)

SCORING RULES:
(single-pass scoring prompt)

MUTATION RULES:
- Pick weakest-scoring dimension
- Generate one mutation (swap/upgrade/reorder/simplify)
- Score the new plan
- Keep if improved, revert if not
- Log each iteration

OUTPUT FORMAT:
When complete, output:
1. The final optimized plan (readable itinerary)
2. A save block so the user can continue in the GPT
3. A summary: iterations run, score improvement, key changes made
[CODEX TASK END]
```

**Key properties:**
- Fully self-contained — no external files, repos, or dependencies
- Outputs a save block, so the user can return to the Custom GPT
- Scoring rules embedded directly, not referenced
- Text-in/text-out reasoning task, not a coding task

**The loop:** GPT -> save block -> Codex -> optimized save block -> back to GPT.

---

## Custom GPT System Prompt Structure

```
1. IDENTITY & TONE
   - You are Trip Optimizer, an AI travel planner that iteratively improves trips
   - Friendly, concise, no jargon
   - User-facing language: "improving your plan," "testing a change,"
     "that made it worse, rolling back"

2. SETUP FLOW
   - Ask questions one at a time (not a wall of questions)
   - Required: destination, dates, travelers, budget
   - Optional: vibes, dietary, loyalty program, anti-patterns
   - Defaults for anything not provided
   - Generate plan + rubric after setup

3. SCORING ENGINE (single-pass)
   - Score across 6-7 dimensions in one structured pass
   - Include adversarial penalties inline
   - Output a composite score 0-100
   - Internal only — user sees score + brief explanation

4. OPTIMIZATION LOOP
   - Mutation types: swap, upgrade, reorder, simplify, research
   - Pick mutation based on weakest dimension
   - Apply, score, keep/revert — all within one response
   - Run 5-10 rounds per "optimize" command
   - Show summary table of what changed

5. SAVE/RESTORE PROTOCOL
   - On "save" or end of conversation: output save block
   - On receiving a save block: parse, reconstruct state, confirm
   - Validate save block structure, handle corruption gracefully

6. CODEX HANDOFF (optional)
   - When user asks for deeper optimization
   - Generate self-contained Codex prompt with full state
   - Step-by-step guide to open Codex and paste it
```

---

## User Interaction Patterns

### What the user sees vs. what's happening

| User sees | Internal operation |
|-----------|-------------------|
| "Let me build your initial plan..." | Generate constraints + rubric + baseline plan |
| "Your plan scores 68/100 — let me improve it" | Single-pass scoring with adversarial penalties |
| "Improving... round 4/8" | Mutation -> score -> keep/revert cycle |
| "Swapped Day 3 temple for backstreet walk (+1.2)" | SWAP mutation kept |
| "Tried upgrading dinner but it scored worse, keeping original" | Mutation reverted |
| "Your plan: 68 -> 81 after 8 rounds" | Optimization summary |

### Natural language commands

- "Plan a trip to Japan" -> setup flow
- "Optimize" / "Make it better" / "Keep improving" -> run optimization rounds
- "I don't like this hotel" / "Swap day 3 dinner" -> user-directed mutation
- "Why did it score low on food?" -> explain dimension scores
- "Save" / "Save my progress" -> output save block
- *pastes save block* -> restore and continue
- "Show my plan" -> render current itinerary
- "How do I optimize overnight?" -> Codex handoff guide

### User-directed changes

Users can intervene at any time:
- "I want to spend more time in Kyoto" -> reallocate days, re-score
- "Add a day trip to Nara" -> add to plan, re-score
- "I hate museums" -> add to anti-patterns, re-score with updated rubric

User changes are applied as forced mutations that always "keep." The score might drop, but subsequent optimization rounds improve around the user's constraint.

---

## What's Lost vs. the CLI

| CLI feature | GPT equivalent |
|------------|----------------|
| 100+ iterations overnight | 5-10 per session, multi-session, or Codex for batch |
| Git-backed ratchet | Save block (manual, portable) |
| activities_db.json | GPT researches on the fly per session |
| Persistent profile across trips | User pastes previous save blocks or states preferences |
| Post-trip debrief | "How was your trip?" conversation, updates preferences for next plan |
| Browser research | ChatGPT's browsing capability (if enabled) |

## What's Gained

- **Zero setup** — click a link, start planning
- **No API key, no CLI, no npm** — works for anyone with ChatGPT
- **Conversational** — feels like talking to a travel-savvy friend
- **Natural intervention** — "I hate museums" instead of editing YAML
- **Portable** — save blocks can be shared, copied, backed up

---

## What We Build

1. **Custom GPT system prompt** — the bulk of the work
2. **README / landing page** — explains what it does, links to the GPT
3. **Conversation starters** — pre-built entry points

## What We Don't Build

- No backend, server, or database
- No GPT Actions
- No npm package (for this audience)
- No user accounts or auth
- No payment system

---

## Future: Claude Version

The same concepts port to a Claude Project or Claude.ai artifact:
- System prompt adapted for Claude's strengths
- Save block format is platform-agnostic
- Codex handoff replaced with equivalent (Claude agent mode, or just more in-conversation rounds)

The CLI, Custom GPT, and future Claude version are three interfaces to the same optimization philosophy — same mutation types, same adversarial scoring, same ratchet logic.

---

## Implementation Plan

### Phase 1: System Prompt
- Write the full Custom GPT system prompt
- Encode setup flow, scoring engine, optimization loop, save/restore
- Test iteratively in ChatGPT

### Phase 2: Save Block Protocol
- Design and test save block format
- Ensure round-trip fidelity (save -> restore -> optimize -> save)
- Test with various trip sizes (3-day weekend vs. 21-day multi-country)

### Phase 3: Codex Handoff
- Design the self-contained Codex prompt template
- Test Codex running optimization loops from the prompt
- Write the step-by-step user guide

### Phase 4: Polish & Publish
- Create conversation starters
- Write landing page / README
- Publish Custom GPT
- Test with non-technical users (the original audience)

---

*This design extends trip-optimizer to non-technical users by meeting them where they already are — inside ChatGPT. The optimization loop, adversarial scoring, and iterative improvement are preserved. The interface changes from terminal to conversation. The infrastructure changes from local Node.js to zero.*

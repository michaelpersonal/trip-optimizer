# Preference Interview Design

**Goal:** Capture nuanced user preferences during init beyond structured checkboxes — must-visit places, hard constraints, travel style, group dynamics — via free-text inputs and LLM-generated follow-up questions.

**Problem:** The current init flow only collects structured data (dates, cities, budget, vibes). Users have preferences that checkboxes can't capture: "my daughter flies in separately on Jun 12", "we love hole-in-the-wall noodle shops", "no early mornings — we have a toddler". Power users can type these into the agent session, but most users don't know they can do that.

---

## Schema Changes

Add three fields to `TripConstraints` in `schemas.ts`:

```typescript
must_visit: string[];        // e.g., ["Great Wall at Mutianyu", "teamLab Borderless"]
hard_constraints: string[];  // free text, e.g., ["No early mornings", "Daughter arrives Jun 12, departs Jun 13"]
user_notes: string;          // concatenated answers from LLM follow-up conversation
```

In `constraints.yaml` output:

```yaml
must_visit:
  - "Great Wall at Mutianyu section"
  - "teamLab Borderless"

hard_constraints:
  - "No early mornings — nothing before 9am"
  - "Daughter flies in separately on Jun 12, departs Jun 13"
  - "Avoid touristy places"

user_notes: |
  Street food and night markets over sit-down restaurants. Relaxed pace
  in Zhangjiajie — traveling with a 4 year old. Would love to find a
  local tea house experience. Friend recommended Fuqi Feipian in Changsha.
```

## Init Flow Changes

After the existing structured questions (vibes, anti-patterns), add two new steps before LLM generation begins:

### Step A: Free-text inputs

```
? Any must-visit places or activities? (comma-separated, Enter to skip)
> Great Wall at Mutianyu, teamLab Borderless

? Any constraints or special circumstances? (Enter to skip)
> My daughter flies in separately on Jun 12 and leaves Jun 13.
> She hates touristy places. No early mornings for the group.
```

- First input splits on commas into `must_visit[]`
- Second input goes into `hard_constraints[]` (split on periods/newlines for multiple items, or stored as-is)

### Step B: LLM-generated follow-up questions

One LLM call generates 3-5 tailored questions based on all structured answers + must_visit + hard_constraints. Each question is asked via inquirer `input()` in sequence. All answers are concatenated into `user_notes`.

Prompt for generating questions:

```
You are a travel planning assistant conducting a brief interview.
Based on the trip details below, generate 3-5 follow-up questions
to understand this traveler's preferences better.

Ask about things the structured data DOESN'T capture:
- Pace and energy level (packed days vs lazy mornings?)
- Food specifics (street food vs fine dining? adventurous eater?)
- Travel style (plan every minute vs leave room for spontaneity?)
- Group dynamics (different interests among travelers?)
- Specific experiences they're dreaming of
- Things that would ruin the trip

Do NOT ask about things already answered (dates, cities, budget,
must-visit, constraints).
Do NOT ask more than 5 questions.

## Trip Details
[all structured answers + must_visit + hard_constraints]

Return a JSON array of question strings, nothing else:
["question 1", "question 2", ...]
```

### i18n

New message keys:
- `trip.must_visit` — "Any must-visit places or activities? (comma-separated, Enter to skip)"
- `trip.hard_constraints` — "Any constraints or special circumstances? (Enter to skip)"
- `trip.interview_generating` — "Generating follow-up questions..."
- `trip.interview_intro` — "A few quick questions to understand your travel style:"

## Downstream Usage

### Plan generator (`plan.ts`)

Add to prompt:
```
Must-visit: Great Wall at Mutianyu, teamLab Borderless
Constraints: No early mornings. Daughter arrives Jun 12, departs Jun 13.
Travel style notes: Street food over sit-down. Relaxed pace. Local tea house experience.
```

### Rubric generator (`rubrics.ts`)

Add to `tripSummary`. The LLM adapts dimensions — e.g., if it sees "traveling with a 4 year old" it might add a `family_friendliness` sub-dimension, or weight `pacing` higher.

### Agent program (`program.md`)

Add as a "User Preferences" section:
```
## User Preferences (DO NOT violate)
- Must include: Great Wall at Mutianyu, teamLab Borderless
- Daughter arrives Jun 12, departs Jun 13 — plan accordingly
- No early mornings, prefer street food, relaxed pace
```

The optimizer sees this on every iteration so it won't mutate away must-visit items or schedule 7am activities.

### Scorer

No direct changes needed. The rubric generator adapts dimensions based on the full constraints, and the adversarial critic already checks against `constraints.yaml`.

## Files to Modify

- `src/data/schemas.ts` — add `must_visit`, `hard_constraints`, `user_notes` to `TripConstraints`
- `src/generators/constraints.ts` — add fields to `InitAnswers`, include in YAML output
- `src/commands/init.ts` — add Step A (free-text inputs) and Step B (LLM follow-up)
- `src/i18n.ts` — add new message keys
- `src/generators/plan.ts` — include new fields in prompt
- `src/generators/rubrics.ts` — include new fields in tripSummary
- `src/generators/program.ts` — add "User Preferences" section

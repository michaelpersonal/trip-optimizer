import type { TripConstraints } from '../data/schemas.js';
import type { Config } from '../data/config.js';

export function generateProgram(constraints: TripConstraints, config: Config): string {
  const hasSearchApi = !!config.search_api?.api_key;

  const researchSection = `### Research Sources (in priority order)

1. **Browser research** (if agent-browser skill is available):
   - Invoke the \`agent-browser\` skill to visit Google Maps, Dianping, Xiaohongshu, TripAdvisor
   - Extract ratings, review counts, seasonal menus
   - This gives real-time, ground-truth data

${hasSearchApi ? `2. **Web search API** (configured):
   - Use WebSearch tool for "[city] hidden gems locals recommend"
   - Search for "[city] overrated tourist traps to skip"
   - Search for "[city] best street food locals recommend"
   - Search for seasonal factors

3. **LLM knowledge** (fallback):` : `2. **LLM knowledge** (primary):
`}   - Use training data for activity and restaurant recommendations
   - Flag entries as source: "llm_knowledge" so scorer weights them lower
   - Good for major destinations, weaker for obscure ones`;

  return `# trip-optimizer Agent Instructions

## Setup
1. Read \`constraints.yaml\` for fixed parameters and preferences
2. Read the current \`plan.md\` as baseline
3. Read \`activities_db.json\` (may be empty on first run)
4. Run scoring on the baseline plan, record as initial score
5. Confirm setup, then begin

## Phase 1: Research Sprint

Before mutating anything, build knowledge. For each city in the plan:

${researchSection}

### Research Query Patterns
- "[City] hidden gems locals only"
- "[City] overrated tourist traps to skip"
- "[City] best street food locals recommend"
- "[City] atmospheric neighborhoods to walk"
- "[City] what to do in [season] seasonal"
- "[City] authentic experiences not on TripAdvisor"

After researching, add all findings to \`activities_db.json\` with scores and sources.
Git commit the updated database.

## Phase 2: Optimization Loop

\`\`\`
LOOP FOREVER:

1. Pick a mutation type (rotate through these):
   a. SWAP — replace an activity with a higher-scored alternative from activities_db
   b. REALLOCATE — move a day between cities (within min/max bounds)
   c. REORDER — rearrange a day's activities for better geographic clustering
   d. UPGRADE — replace a restaurant with a more authentic option
   e. SIMPLIFY — remove a low-scoring activity, leave free wandering time
   f. RESEARCH — search for new options in the weakest-scoring city,
      add to activities_db, then attempt a swap

2. Make ONE change to plan.md
3. Git commit with descriptive message
4. Score the new plan (comparative mode for most iterations, absolute every 10th)
5. If score improved → keep the commit
6. If score equal or worse → git reset --hard HEAD~1
7. Log to results.tsv (tab-separated):
   iteration, commit, score_before, score_after, delta, status, mutation_type, description
8. NEVER STOP — run until interrupted
\`\`\`

## Mutation Guidelines

- **One mutation per iteration.** Don't change multiple things at once.
- **Free time is valuable.** Empty afternoons for wandering can score higher than mediocre activities.
- **Respect geographic clustering.** Don't zigzag across the city.
- **Respect day bounds.** When reallocating days, stay within min/max in constraints.yaml.
- **Transit days are partial days.** A day with 5+ hours transit should not have full activities.
- **Research when stuck.** If 5+ consecutive discards, trigger a RESEARCH mutation.

## What You CANNOT Do

- Add or remove cities from the route
- Change the city ordering
- Modify constraints.yaml or rubrics.yaml
- Exceed min/max day bounds per city
- Schedule activities during transit time
${constraints.hard_requirements.map(r => `- Violate: ${r}`).join('\n')}

## Crash/Failure Handling

- If scoring fails, revert and log as crash
- If 10 consecutive discards, try REALLOCATE or RESEARCH
- If score plateaus for 20+ iterations, shift to RESEARCH phase
- results.tsv survives git resets (it's gitignored)

## Context Management

- Write long outputs to files, don't flood context
- Write research to activities_db.json immediately
- Read results.tsv periodically to avoid repeating failed mutations
`;
}

import type { TripConstraints } from '../data/schemas.js';
import type { Config } from '../data/config.js';
import { getLanguage } from '../i18n.js';

export function generateProgram(constraints: TripConstraints, config: Config): string {
  const hasSearchApi = !!config.search_api?.api_key;
  const isZh = getLanguage() === 'zh';

  const researchSources = isZh
    ? `### 研究来源（按优先级排序）

1. **浏览器研究**（如果 agent-browser 技能可用）：
   - 使用 \`agent-browser\` 技能访问大众点评、小红书、马蜂窝、携程、Google Maps
   - 提取评分、评论数量、当季菜单、本地人推荐
   - 这是最真实的实时数据来源
   - 优先搜索中文平台（小红书、大众点评、马蜂窝），因为本地人的推荐更可靠

${hasSearchApi ? `2. **网络搜索 API**（已配置）：
   - 搜索 "[城市] 本地人推荐 隐藏美食"
   - 搜索 "[城市] 避雷 踩坑 游客陷阱"
   - 搜索 "[城市] 小众景点 当地人才知道"
   - 搜索 "[城市] 当季特色 时令美食"
   - 同时搜索中英文关键词以获取更全面的结果

3. **LLM 知识**（备选）：` : `2. **LLM 知识**（主要来源）：
`}   - 使用训练数据获取活动和餐厅推荐
   - 标记来源为 "llm_knowledge" 以便评分器降低权重
   - 对知名目的地效果好，对冷门地点效果较差`
    : `### Research Sources (in priority order)

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

  const researchQueries = isZh
    ? `### 研究搜索关键词
- "[城市] 本地人推荐 小众景点"
- "[城市] 避雷指南 游客陷阱"
- "[城市] 必吃美食 苍蝇馆子 本地人排队"
- "[城市] 值得逛的街区 City Walk"
- "[城市] [季节] 当季特色 时令推荐"
- "[城市] 深度游 不在攻略上的体验"
- "[City] hidden gems locals only"（英文补充搜索）
- "[City] authentic local food NOT tourist"（英文补充搜索）`
    : `### Research Query Patterns
- "[City] hidden gems locals only"
- "[City] overrated tourist traps to skip"
- "[City] best street food locals recommend"
- "[City] atmospheric neighborhoods to walk"
- "[City] what to do in [season] seasonal"
- "[City] authentic experiences not on TripAdvisor"`;

  const outputLanguage = isZh
    ? `\n## 输出语言\n\n所有输出（plan.md、activities_db.json 中的描述、commit messages）都必须使用简体中文。\n`
    : '';

  return `# trip-optimizer Agent Instructions

## Setup
1. Read \`constraints.yaml\` for fixed parameters and preferences
2. Read the current \`plan.md\` as baseline
3. Read \`activities_db.json\` (may be empty on first run)
4. Run scoring on the baseline plan, record as initial score
5. Confirm setup, then begin

## Phase 1: Research Sprint

Before mutating anything, build knowledge. For each city in the plan:

${researchSources}

${researchQueries}

After researching, add all findings to \`activities_db.json\` with scores and sources.
Git commit the updated database.
${outputLanguage}
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

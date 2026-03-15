export type Language = 'en' | 'zh';

const messages = {
  // Init flow
  'init.title': { en: 'trip-optimizer', zh: 'trip-optimizer' },
  'init.language': { en: 'Language / 语言:', zh: '语言 / Language:' },
  'init.first_time': { en: 'First time? Let\'s set up your profile.', zh: '首次使用？让我们设置您的个人资料。' },
  'init.vertex_detected': { en: 'Using Vertex AI (detected from environment).', zh: '使用 Vertex AI（从环境变量检测）。' },
  'init.api_key': { en: 'Anthropic API key:', zh: 'Anthropic API 密钥：' },
  'init.api_key_saved': { en: 'API key saved.', zh: 'API 密钥已保存。' },
  'init.api_key_required': { en: 'API key is required', zh: 'API 密钥为必填项' },
  'init.model_override': { en: 'Use a different LLM? (e.g., Kimi, DeepSeek)', zh: '使用其他大模型？（如 Kimi、DeepSeek）' },
  'init.model_override_yes': { en: 'Yes, configure a custom model', zh: '是，配置自定义模型' },
  'init.model_override_no': { en: 'No, use default', zh: '否，使用默认' },
  'init.model_name': { en: 'Model name (e.g., moonshot-v1-128k):', zh: '模型名称（如 moonshot-v1-128k）：' },
  'init.model_base_url': { en: 'API base URL (e.g., https://api.moonshot.cn/v1):', zh: 'API 地址（如 https://api.moonshot.cn/v1）：' },
  'init.model_api_key': { en: 'API key for this model:', zh: '该模型的 API 密钥：' },
  'init.model_saved': { en: 'Custom model configured.', zh: '自定义模型已配置。' },
  'init.model_note': { en: 'Note: Custom models only work in standalone mode (trip-optimizer run --standalone).', zh: '注意：自定义模型仅在独立模式下运行（trip-optimizer run --standalone）。' },

  // Profile setup
  'profile.loyalty': { en: 'Hotel loyalty program:', zh: '酒店会员计划：' },
  'profile.dietary': { en: 'Dietary restrictions (Space to select, Enter to confirm):', zh: '饮食限制（空格选择，回车确认）：' },

  // Trip questions
  'trip.start_date': { en: 'Start date (YYYY-MM-DD):', zh: '出发日期（YYYY-MM-DD）：' },
  'trip.end_date': { en: 'End date (YYYY-MM-DD):', zh: '结束日期（YYYY-MM-DD）：' },
  'trip.travelers': { en: 'Number of travelers:', zh: '出行人数：' },
  'trip.origin': { en: 'Departing from (city):', zh: '出发城市：' },
  'trip.cities': { en: 'Cities in order (comma-separated):', zh: '城市顺序（逗号分隔）：' },
  'trip.cities_validate': { en: 'Enter at least one city', zh: '请至少输入一个城市' },
  'trip.budget': { en: 'Total budget (USD):', zh: '总预算（USD）：' },
  'trip.vibes': { en: 'Pick your vibes (Space to select, Enter to confirm):', zh: '选择旅行风格（空格选择，回车确认）：' },
  'trip.anti_patterns': { en: 'Anything to avoid? (comma-separated, or press Enter to skip):', zh: '有什么要避免的？（逗号分隔，或按回车跳过）：' },

  // Vibe choices
  'vibe.wandering': { en: 'Wandering & exploring', zh: '漫步探索' },
  'vibe.food': { en: 'Food & culinary', zh: '美食之旅' },
  'vibe.culture': { en: 'Culture & arts', zh: '文化艺术' },
  'vibe.nature': { en: 'Nature & outdoors', zh: '自然户外' },
  'vibe.adventure': { en: 'Adventure & thrills', zh: '冒险刺激' },
  'vibe.relaxation': { en: 'Relaxation & wellness', zh: '休闲养生' },
  'vibe.nightlife': { en: 'Nightlife & entertainment', zh: '夜生活娱乐' },
  'vibe.history': { en: 'History & heritage', zh: '历史人文' },
  'vibe.shopping': { en: 'Shopping', zh: '购物' },
  'vibe.family': { en: 'Family-friendly', zh: '亲子游' },
  'vibe.romantic': { en: 'Romantic', zh: '浪漫之旅' },

  // Edit flow
  'edit.current_settings': { en: 'Current settings:', zh: '当前设置：' },
  'edit.what_to_do': { en: 'What would you like to do?', zh: '您想做什么？' },
  'edit.regenerate': { en: 'Regenerate with same settings', zh: '使用相同设置重新生成' },
  'edit.edit_fields': { en: 'Edit specific fields', zh: '编辑特定字段' },
  'edit.restart': { en: 'Start over from scratch', zh: '从头开始' },
  'edit.which_fields': { en: 'Which fields to edit? (Space to select, Enter to confirm):', zh: '编辑哪些字段？（空格选择，回车确认）：' },

  // Field labels
  'field.dates': { en: 'Dates', zh: '日期' },
  'field.travelers': { en: 'Travelers', zh: '人数' },
  'field.origin': { en: 'Origin', zh: '出发地' },
  'field.cities': { en: 'Cities', zh: '城市' },
  'field.budget': { en: 'Budget', zh: '预算' },
  'field.vibes': { en: 'Vibes', zh: '风格' },
  'field.anti_patterns': { en: 'Anti-patterns', zh: '避免事项' },

  // Progress
  'progress.generating_rubrics': { en: 'Generating scoring rubrics...', zh: '正在生成评分标准...' },
  'progress.rubrics_done': { en: 'Scoring rubrics generated', zh: '评分标准已生成' },
  'progress.rubrics_fail': { en: 'Failed to generate scoring rubrics', zh: '评分标准生成失败' },
  'progress.generating_plan': { en: 'Generating initial plan...', zh: '正在生成初始行程...' },
  'progress.plan_done': { en: 'Initial plan generated', zh: '初始行程已生成' },
  'progress.plan_fail': { en: 'Failed to generate initial plan', zh: '初始行程生成失败' },
  'progress.creating_project': { en: 'Creating trip project...', zh: '正在创建旅行项目...' },
  'progress.project_created': { en: 'Trip project created at', zh: '旅行项目已创建于' },

  // Next steps
  'next.title': { en: 'Next steps:', zh: '下一步：' },
  'next.review': { en: '# Review constraints.yaml and rubrics.yaml', zh: '# 查看 constraints.yaml 和 rubrics.yaml' },

  // Errors
  'error.provider_fail': { en: 'Failed to create LLM provider', zh: 'LLM 提供者创建失败' },
  'error.model_check': { en: 'Check that your model is available', zh: '请检查您的模型是否可用' },
  'error.auth_check': { en: 'Check your authentication: run "gcloud auth application-default login"', zh: '请检查认证：运行 "gcloud auth application-default login"' },
} as const;

type MessageKey = keyof typeof messages;

let currentLanguage: Language = 'en';

export function setLanguage(lang: Language): void {
  currentLanguage = lang;
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function t(key: MessageKey): string {
  const entry = messages[key];
  return entry[currentLanguage] || entry.en;
}

export function getLlmLanguageInstruction(): string {
  if (currentLanguage === 'zh') {
    return '\n\nIMPORTANT: Generate ALL output in Chinese (Simplified Chinese / 简体中文). All descriptions, recommendations, and commentary must be written in Chinese.';
  }
  return '';
}

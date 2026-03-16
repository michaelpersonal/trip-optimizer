import type { LLMProvider } from './provider.js';

export interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface ChatMessage {
  content: string;
  reasoning_content?: string;
}

interface ChatChoice {
  message: ChatMessage;
  finish_reason: string;
}

interface ChatResponse {
  choices: ChatChoice[];
}

// Models that support `thinking: { type: "disabled" }` to skip chain-of-thought.
// Only includes models whose API actually supports this parameter.
// OpenAI o1/o3 do NOT support this — they use `reasoning_effort` instead
// and don't expose reasoning_content separately.
const THINKING_DISABLE_PATTERNS = [
  /kimi-k2/i,
  /deepseek-r1/i,
  /deepseek-reasoner/i,
];

function supportsThinkingDisable(model: string): boolean {
  return THINKING_DISABLE_PATTERNS.some(p => p.test(model));
}

export class OpenAICompatibleProvider implements LLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private reasoning: boolean;

  constructor(options: OpenAICompatibleOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.reasoning = supportsThinkingDisable(this.model);
  }

  async complete(prompt: string, maxTokens: number): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    };

    if (this.reasoning) {
      body.thinking = { type: 'disabled' };
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const respBody = await response.text();
          // Retry on rate limit or overload
          if ((response.status === 429 || response.status === 529) && attempt < 2) {
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          throw new Error(`${this.model} API error ${response.status}: ${respBody}`);
        }

        const data = await response.json() as ChatResponse;
        const choice = data.choices?.[0];

        if (!choice?.message) {
          throw new Error(`Unexpected response from ${this.model}: no message in response`);
        }

        const { content, reasoning_content } = choice.message;

        if (content) {
          return content.trim();
        }

        if (reasoning_content) {
          throw new Error(
            `${this.model} exhausted token budget on reasoning (${maxTokens} tokens). ` +
            `The model used all tokens for chain-of-thought without producing a final answer. ` +
            `This may resolve on retry, or the prompt may be too complex for the token budget.`
          );
        }

        throw new Error(`${this.model} returned empty response`);
      } catch (err: any) {
        const msg = err?.message || String(err);
        const retryable = msg.includes('exhausted token budget') ||
          msg.includes('timeout') || msg.includes('ECONNRESET');
        if (retryable && attempt < 2) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Unreachable');
  }
}

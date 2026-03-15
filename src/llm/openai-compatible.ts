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

// Reasoning models (like Kimi K2.5, DeepSeek-R1) use tokens for chain-of-thought.
// They need much higher max_tokens to leave room for the actual answer after reasoning.
const REASONING_MODEL_PATTERNS = [
  /kimi-k2/i,
  /deepseek-r1/i,
  /deepseek-reasoner/i,
  /o1/i,
  /o3/i,
];

function isReasoningModel(model: string): boolean {
  return REASONING_MODEL_PATTERNS.some(p => p.test(model));
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
    this.reasoning = isReasoningModel(this.model);
  }

  async complete(prompt: string, maxTokens: number): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;

    // Reasoning models need 4-8x more tokens because reasoning_content
    // consumes from the same budget before the actual content is generated
    const effectiveMaxTokens = this.reasoning ? maxTokens * 6 : maxTokens;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: effectiveMaxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${this.model} API error ${response.status}: ${body}`);
    }

    const data = await response.json() as ChatResponse;
    const choice = data.choices?.[0];

    if (!choice?.message) {
      throw new Error(`Unexpected response from ${this.model}: no message in response`);
    }

    const { content, reasoning_content } = choice.message;

    // For reasoning models: content has the final answer, reasoning_content has the CoT.
    // If content is empty but reasoning exists, the model ran out of tokens during reasoning.
    if (content) {
      return content.trim();
    }

    if (reasoning_content) {
      // Model exhausted tokens on reasoning — try to extract any useful content
      // from the end of the reasoning (sometimes the answer starts forming there)
      throw new Error(
        `${this.model} exhausted token budget on reasoning (${effectiveMaxTokens} tokens). ` +
        `The model used all tokens for chain-of-thought without producing a final answer. ` +
        `This may resolve on retry, or the prompt may be too complex for the token budget.`
      );
    }

    throw new Error(`${this.model} returned empty response`);
  }
}

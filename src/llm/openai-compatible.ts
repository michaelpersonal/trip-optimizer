import type { LLMProvider } from './provider.js';

export interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class OpenAICompatibleProvider implements LLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(options: OpenAICompatibleOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async complete(prompt: string, maxTokens: number): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${this.model} API error ${response.status}: ${body}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    if (!data.choices?.[0]?.message?.content) {
      throw new Error(`Unexpected response from ${this.model}: ${JSON.stringify(data)}`);
    }

    return data.choices[0].message.content.trim();
  }
}

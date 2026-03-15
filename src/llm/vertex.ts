import AnthropicVertex from '@anthropic-ai/vertex-sdk';
import type { LLMProvider } from './provider.js';

export class VertexProvider implements LLMProvider {
  private client: AnthropicVertex;
  private model: string;

  constructor(options?: { projectId?: string; region?: string; model?: string }) {
    this.client = new AnthropicVertex({
      projectId: options?.projectId ?? process.env.GOOGLE_CLOUD_PROJECT,
      region: options?.region ?? process.env.GOOGLE_CLOUD_LOCATION ?? 'us-east5',
    });
    this.model = options?.model ?? 'claude-sonnet-4@20250514';
  }

  async complete(prompt: string, maxTokens: number): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Expected text response from LLM');
    return block.text.trim();
  }
}

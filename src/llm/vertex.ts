import AnthropicVertex from '@anthropic-ai/vertex-sdk';
import type { LLMProvider } from './provider.js';

function extractText(content: Array<{ type: string; text?: string }>): string {
  const texts = content
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text!);
  if (texts.length === 0) {
    const types = content.map(b => b.type).join(', ');
    throw new Error(`No text blocks in response. Content types: ${types}`);
  }
  return texts.join('\n').trim();
}

export class VertexProvider implements LLMProvider {
  private client: AnthropicVertex;
  private model: string;

  constructor(options?: { projectId?: string; region?: string; model?: string }) {
    this.client = new AnthropicVertex({
      projectId: options?.projectId ?? process.env.GOOGLE_CLOUD_PROJECT,
      region: options?.region ?? process.env.GOOGLE_CLOUD_LOCATION ?? 'us-east5',
    });
    this.model = options?.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4@20250514';
  }

  async complete(prompt: string, maxTokens: number): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const stream = this.client.messages.stream({
          model: this.model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        });
        const response = await stream.finalMessage();
        return extractText(response.content);
      } catch (err: any) {
        const msg = err?.message || String(err);
        // Retry on transient errors (rate limit, overload, timeout)
        const retryable = msg.includes('529') || msg.includes('overload') ||
          msg.includes('rate') || msg.includes('timeout') || msg.includes('DEADLINE');
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

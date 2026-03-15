import type { LLMProvider } from './provider.js';
import type { Config } from '../data/config.js';
import { AnthropicProvider } from './anthropic.js';
import { VertexProvider } from './vertex.js';

export function createProvider(config: Config): LLMProvider {
  // Auto-detect Vertex AI from environment
  if (process.env.CLAUDE_CODE_USE_VERTEX === '1' || process.env.GOOGLE_CLOUD_PROJECT) {
    return new VertexProvider();
  }

  // Direct Anthropic API
  if (!config.api_key) {
    throw new Error(
      'No API key configured and no Vertex AI environment detected.\n' +
      '  Run: trip-optimizer config set api_key <key>\n' +
      '  Or set GOOGLE_CLOUD_PROJECT + CLAUDE_CODE_USE_VERTEX=1 for Vertex AI'
    );
  }

  return new AnthropicProvider(config.api_key);
}

export interface LLMProvider {
  complete(prompt: string, maxTokens: number): Promise<string>;
}

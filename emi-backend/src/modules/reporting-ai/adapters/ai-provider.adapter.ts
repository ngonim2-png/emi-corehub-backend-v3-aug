export interface AiProviderAdapter {
  complete(systemContext: string, question: string): Promise<string>;
}

export const AI_PROVIDER = 'AI_PROVIDER';

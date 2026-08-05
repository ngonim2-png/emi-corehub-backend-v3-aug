import { Injectable, Logger } from '@nestjs/common';
import { AiProviderAdapter } from './ai-provider.adapter';

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
}

/**
 * Calls the Anthropic Messages API directly over fetch (no SDK dependency).
 * The AI assistant only ever receives a pre-aggregated summary object
 * (counts, totals, names it's already allowed to see) built by
 * ReportingService - never raw client documents or full table dumps -
 * so a prompt injection in a question can't exfiltrate more than the
 * summary already contains.
 */
@Injectable()
export class AnthropicAiAdapter implements AiProviderAdapter {
  private readonly logger = new Logger(AnthropicAiAdapter.name);

  async complete(systemContext: string, question: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY not configured - AI assistant is disabled');
      return 'The AI assistant is not configured on this environment.';
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: `${systemContext}\n\nQuestion: ${question}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      this.logger.error(`Anthropic API returned ${response.status}`);
      return 'The AI assistant could not be reached right now.';
    }

    const data = (await response.json()) as AnthropicResponse;
    return data.content.map((block) => block.text ?? '').join('\n').trim() || 'No response received.';
  }
}

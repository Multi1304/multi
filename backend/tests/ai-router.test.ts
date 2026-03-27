import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { groqChatMock, ollamaChatMock } = vi.hoisted(() => ({
  groqChatMock: vi.fn(),
  ollamaChatMock: vi.fn(),
}));

vi.mock('../src/services/groq.service', () => ({
  GroqService: {
    chat: groqChatMock,
  },
}));

vi.mock('../src/services/ollama.service', () => ({
  OllamaService: {
    chat: ollamaChatMock,
  },
}));

import { AiRouterService } from '../src/services/aiRouter.service';

describe('AiRouterService', () => {
  const originalPreferred = process.env.AI_PREFERRED_PROVIDER;
  const originalFallback = process.env.AI_FALLBACK_PROVIDER;

  beforeEach(() => {
    process.env.AI_PREFERRED_PROVIDER = 'groq';
    process.env.AI_FALLBACK_PROVIDER = 'ollama';
  });

  afterEach(() => {
    process.env.AI_PREFERRED_PROVIDER = originalPreferred;
    process.env.AI_FALLBACK_PROVIDER = originalFallback;
    vi.clearAllMocks();
  });

  it('uses Groq first when available', async () => {
    groqChatMock.mockResolvedValue('{"ok":true}');

    const result = await AiRouterService.chatWithMeta('prompt', 'system');

    expect(result.provider).toBe('groq');
    expect(result.content).toContain('"ok"');
    expect(ollamaChatMock).not.toHaveBeenCalled();
  });

  it('falls back to Ollama when Groq fails', async () => {
    groqChatMock.mockRejectedValue(new Error('rate limited'));
    ollamaChatMock.mockResolvedValue('{"ok":"local"}');

    const result = await AiRouterService.chatWithMeta('prompt', 'system');

    expect(result.provider).toBe('ollama');
    expect(result.content).toContain('"local"');
  });
});

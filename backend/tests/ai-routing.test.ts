import { afterEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  redisMock: {
    hincrby: vi.fn(),
    expire: vi.fn(),
    hgetall: vi.fn(),
  },
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../src/utils/redis', () => ({
  redis: redisMock,
}));

import { AiRoutingService } from '../src/services/aiRouting.service';

describe('AiRoutingService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns sensible defaults when tenant has no custom settings', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({ settings: {} });

    const settings = await AiRoutingService.getSettings('tenant-1');

    expect(settings.preferredProvider).toBe('groq');
    expect(settings.taskPreferences.batch_nightly[0]).toBe('ollama');
  });

  it('records usage and builds a daily snapshot', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({ settings: {} });
    redisMock.hgetall.mockResolvedValue({
      requests: '2',
      promptTokens: '100',
      completionTokens: '50',
      'provider:groq': '1',
      'provider:ollama': '1',
      'task:doctor': '1',
      'task:batch_nightly': '1',
      fallbacks: '1',
    });

    const snapshot = await AiRoutingService.getSnapshot('tenant-1');

    expect(snapshot.today.requests).toBe(2);
    expect(snapshot.today.providerMix.ollama).toBe(1);
    expect(snapshot.budgetStatus.requestPressure).toBe('low');
  });
});

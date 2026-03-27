import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    apiKey: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    webhook: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

import { SecretRotationService } from '../src/services/secretRotation.service';

describe('enterprise secret rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rotates webhook secrets for a tenant-owned webhook', async () => {
    prismaMock.webhook.findFirst.mockResolvedValue({
      id: 'webhook-1',
      tenantId: 'tenant-1',
      url: 'https://hooks.example.test/camel',
      events: ['flow_completed'],
      active: true,
    });
    prismaMock.webhook.update.mockResolvedValue({
      id: 'webhook-1',
      url: 'https://hooks.example.test/camel',
      events: ['flow_completed'],
      active: true,
      secret: 'new-secret',
    });

    const result = await SecretRotationService.rotateWebhookSecret('tenant-1', 'user-1', 'webhook-1');

    expect(result.webhook.id).toBe('webhook-1');
    expect(result.secret).toHaveLength(64);
    expect(prismaMock.webhook.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'webhook-1' },
    }));
  });
});

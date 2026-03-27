import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';

const { prismaMock, stateMock, consistencyMock, notificationPushMock, routingResolveMock, browserCreatePageMock, timelineGetMock, egressAdmissionEvaluateMock } = vi.hoisted(() => ({
  prismaMock: {
    profile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
  },
  stateMock: {
    getStateSummary: vi.fn(),
  },
  consistencyMock: {
    getSummary: vi.fn(),
  },
  notificationPushMock: vi.fn(),
  routingResolveMock: vi.fn(),
  browserCreatePageMock: vi.fn(),
  timelineGetMock: vi.fn(),
  egressAdmissionEvaluateMock: vi.fn(),
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../src/services/profileState.service', () => ({
  ProfileStateService: stateMock,
}));

vi.mock('../src/services/profileConsistency.service', () => ({
  ProfileConsistencyService: consistencyMock,
}));

vi.mock('../src/services/profileTimeline.service', () => ({
  ProfileTimelineService: {
    getTimeline: timelineGetMock,
  },
}));

vi.mock('../src/services/notificationCenter.service', () => ({
  NotificationCenterService: {
    push: notificationPushMock,
  },
}));

vi.mock('../src/services/networkRouting.service', () => ({
  NetworkRoutingService: {
    resolve: routingResolveMock,
  },
}));

vi.mock('../src/services/browser.node', () => ({
  BrowserNodeService: {
    createPage: browserCreatePageMock,
  },
}));

vi.mock('../src/services/egressAdmission.service', () => ({
  EgressAdmissionService: {
    evaluate: egressAdmissionEvaluateMock,
  },
}));

import { ProfileEncryptionService } from '../src/services/profileEncryption.service';
import { ProfileDoctorService } from '../src/services/profileDoctor.service';
import { ProfileReputationService } from '../src/services/profileReputation.service';
import { SmartLaunchService } from '../src/services/smartLaunch.service';

describe('Profile expansion services', () => {
  const profileId = 'profile-1';
  const tenantId = 'tenant-1';
  const encryptionFile = path.resolve(process.cwd(), 'profile-state', 'encryption', `${profileId}.json`);
  const warmupQueueFile = path.resolve(process.cwd(), 'profile-state', 'warmup-queues', `${tenantId}.json`);

  beforeEach(async () => {
    await fs.remove(path.dirname(encryptionFile));
    await fs.remove(path.dirname(warmupQueueFile));
    vi.clearAllMocks();
    timelineGetMock.mockResolvedValue({ items: [], heatmap: [] });
    egressAdmissionEvaluateMock.mockResolvedValue({ shouldQueue: false, reason: null });
  });

  afterEach(async () => {
    await fs.remove(path.dirname(encryptionFile));
    await fs.remove(path.dirname(warmupQueueFile));
  });

  it('encrypts and decrypts profile buffers with envelope v2', async () => {
    const payload = Buffer.from('hello-camel');
    const encrypted = await ProfileEncryptionService.encryptProfileBuffer(profileId, tenantId, payload);
    const decrypted = await ProfileEncryptionService.decryptProfileBuffer(profileId, tenantId, encrypted, 'test');
    const summary = await ProfileEncryptionService.getSummary(profileId, tenantId);

    expect(decrypted.toString('utf8')).toBe('hello-camel');
    expect(summary.version).toBe('zkp-v2');
    expect(await fs.pathExists(encryptionFile)).toBe(true);
  });

  it('scores unhealthy profiles and detects overlap', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      id: profileId,
      name: 'Primary',
      fingerprint: { canvasSeed: 'seed-1', webglVendor: 'Vendor', webglRenderer: 'Renderer' },
      proxyConfig: { host: '1.1.1.1', port: 1000 },
      fingerprintPresetId: 'preset-a',
    });
    prismaMock.profile.findMany.mockResolvedValue([
      {
        id: 'profile-2',
        name: 'Clone',
        fingerprint: { canvasSeed: 'seed-1', webglVendor: 'Vendor', webglRenderer: 'Renderer' },
        proxyConfig: { host: '1.1.1.1', port: 1000 },
        fingerprintPresetId: 'preset-a',
      },
    ]);
    stateMock.getStateSummary.mockResolvedValue({
      diff: { status: 'diverged' },
      runtimeLease: { locked: true },
    });
    consistencyMock.getSummary.mockResolvedValue({ status: 'drifted' });

    const result = await ProfileDoctorService.evaluate(profileId, tenantId);

    expect(result.healthScore).toBeLessThan(85);
    expect(result.overlap.sharedFingerprintCount).toBe(1);
    expect(notificationPushMock).toHaveBeenCalled();
  });

  it('builds and executes smart launch plan safely', async () => {
    prismaMock.profile.findUnique
      .mockResolvedValueOnce({
        id: profileId,
        name: 'Launchable',
        platform: 'DESKTOP',
        geolocation: {},
        proxyConfig: { host: '2.2.2.2', port: 2000 },
        fingerprint: { userAgent: 'ua' },
      })
      .mockResolvedValueOnce({
        id: profileId,
        name: 'Launchable',
        platform: 'DESKTOP',
        geolocation: {},
        proxyConfig: { host: '2.2.2.2', port: 2000 },
        fingerprint: { userAgent: 'ua' },
      });
    stateMock.getStateSummary.mockResolvedValue({
      diff: { status: 'in_sync' },
      runtimeLease: { locked: false },
      sessionSnapshot: { sessionPersistence: { cookies: { count: 20 } } },
    });
    consistencyMock.getSummary.mockResolvedValue({ status: 'initialized', driftCount: 0 });
    prismaMock.profile.findMany.mockResolvedValue([]);
    routingResolveMock.mockResolvedValue({
      selection: { strategy: 'sticky' },
      endpoint: { id: 'endpoint-1' },
      proxy: { host: '2.2.2.2', port: 2000 },
    });
    browserCreatePageMock.mockResolvedValue({
      goto: vi.fn().mockResolvedValue(undefined),
    });

    const result = await SmartLaunchService.launch(profileId, tenantId);

    expect(result.launchReadiness).toBe('ready');
    expect(browserCreatePageMock).toHaveBeenCalled();
  });

  it('uses warmup learning to keep weak launches conservative', async () => {
    await fs.ensureDir(path.dirname(warmupQueueFile));
    await fs.writeJson(warmupQueueFile, [{
      id: 'warmup-1',
      tenantId,
      profileId,
      profileName: 'Launchable',
      mode: 'light',
      status: 'completed',
      riskBand: 'medium',
      nextWindow: 'next low-traffic hour',
      estimatedDurationMinutes: 20,
      readinessAfterWarmup: 70,
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      actorUserId: 'user-1',
      approvalUserId: 'user-1',
      feedback: {
        outcome: 'worsened',
        notes: 'Recent light warmup was not enough.',
        deltaScore: -6,
        recordedAt: new Date().toISOString(),
      },
    }], { spaces: 2 });

    prismaMock.profile.findUnique.mockResolvedValue({
      id: profileId,
      name: 'Launchable',
      platform: 'DESKTOP',
      geolocation: {},
      proxyConfig: { host: '2.2.2.2', port: 2000 },
      fingerprint: { userAgent: 'ua' },
    });
    stateMock.getStateSummary.mockResolvedValue({
      diff: { status: 'in_sync' },
      runtimeLease: { locked: false },
      sessionSnapshot: { sessionPersistence: { cookies: { count: 30 } } },
    });
    consistencyMock.getSummary.mockResolvedValue({ status: 'initialized', driftCount: 0 });
    prismaMock.profile.findMany.mockResolvedValue([]);
    routingResolveMock.mockResolvedValue({
      selection: { strategy: 'sticky' },
      endpoint: { id: 'endpoint-1' },
      proxy: { host: '2.2.2.2', port: 2000 },
    });

    const result = await SmartLaunchService.plan(profileId, tenantId);

    expect(result.warmupMode).not.toBe('skip');
    expect(result.launchReadiness).toBe('review');
    expect(result.warmupLearning?.lastOutcome).toBe('worsened');
  });

  it('folds warmup learning into profile reputation', async () => {
    await fs.ensureDir(path.dirname(warmupQueueFile));
    await fs.writeJson(warmupQueueFile, [{
      id: 'warmup-2',
      tenantId,
      profileId,
      profileName: 'Primary',
      mode: 'moderate',
      status: 'completed',
      riskBand: 'medium',
      nextWindow: '02:00-05:00 local time',
      estimatedDurationMinutes: 40,
      readinessAfterWarmup: 82,
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      actorUserId: 'user-1',
      approvalUserId: 'user-1',
      feedback: {
        outcome: 'improved',
        notes: 'Moderate warmup raised readiness.',
        deltaScore: 6,
        recordedAt: new Date().toISOString(),
      },
    }], { spaces: 2 });

    prismaMock.profile.findUnique.mockResolvedValue({
      id: profileId,
      name: 'Primary',
      createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      platform: 'DESKTOP',
      fingerprint: { canvasSeed: 'seed-1', webglVendor: 'Vendor', webglRenderer: 'Renderer' },
      proxyConfig: { host: '1.1.1.1', port: 1000 },
      fingerprintPresetId: 'preset-a',
    });
    prismaMock.profile.findMany.mockResolvedValue([]);
    prismaMock.account.findMany.mockResolvedValue([]);
    stateMock.getStateSummary.mockResolvedValue({
      diff: { status: 'in_sync' },
      runtimeLease: { locked: false },
    });
    consistencyMock.getSummary.mockResolvedValue({ status: 'initialized' });
    const result = await ProfileReputationService.scoreProfile(profileId, tenantId);

    expect(result.warmupLearning?.improved).toBeGreaterThanOrEqual(1);
    expect(result.notes.some((item: string) => item.includes('Warmup learning'))).toBe(true);
  });
});

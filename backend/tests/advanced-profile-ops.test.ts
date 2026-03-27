import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';

const { prismaMock, xaiChatMock, notificationPushMock, doctorEvaluateMock, timelineGetMock, reputationScoreMock } = vi.hoisted(() => ({
  prismaMock: {
    tenant: {
      findUnique: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
  },
  xaiChatMock: vi.fn(),
  notificationPushMock: vi.fn(),
  doctorEvaluateMock: vi.fn(),
  timelineGetMock: vi.fn(),
  reputationScoreMock: vi.fn(),
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../src/services/xai.service', () => ({
  XaiService: {
    chat: xaiChatMock,
  },
}));

vi.mock('../src/services/notificationCenter.service', () => ({
  NotificationCenterService: {
    push: notificationPushMock,
  },
}));

vi.mock('../src/services/audit.service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/services/sandboxRuntimeEmulation.service', () => ({
  SandboxRuntimeEmulationService: {
    getSettings: vi.fn().mockResolvedValue({
      allowedHosts: ['localhost'],
    }),
  },
}));

vi.mock('../src/services/productionRuntimeEmulation.service', () => ({
  ProductionRuntimeEmulationService: {
    getSettings: vi.fn().mockResolvedValue({
      allowedHosts: ['localhost'],
    }),
  },
}));

vi.mock('../src/services/profileDoctor.service', () => ({
  ProfileDoctorService: {
    evaluate: doctorEvaluateMock,
  },
}));

vi.mock('../src/services/profileTimeline.service', () => ({
  ProfileTimelineService: {
    getTimeline: timelineGetMock,
  },
}));

vi.mock('../src/services/profileReputation.service', () => ({
  ProfileReputationService: {
    scoreProfile: reputationScoreMock,
  },
}));

import { ProfileQuarantineService } from '../src/services/profileQuarantine.service';
import { ProfileDecoupleAssistantService } from '../src/services/profileDecoupleAssistant.service';
import { IntentFlowSandboxService } from '../src/services/intentFlowSandbox.service';
import { KubernetesReadinessService } from '../src/services/kubernetesReadiness.service';
import { PredictiveWarmupService } from '../src/services/predictiveWarmup.service';
import { ProfileDoctorAiService } from '../src/services/profileDoctorAi.service';
import { PredictiveWarmupQueueService } from '../src/services/predictiveWarmupQueue.service';

describe('Advanced profile operations', () => {
  const profileId = 'profile-ops-1';
  const tenantId = 'tenant-ops-1';
  const quarantineDir = path.resolve(process.cwd(), 'profile-state', 'quarantine');
  const warmupQueueDir = path.resolve(process.cwd(), 'profile-state', 'warmup-queues');
  const warmupSettingsDir = path.resolve(process.cwd(), 'profile-state', 'warmup-settings');
  const k8sDir = path.resolve(process.cwd(), 'deploy', 'k8s');

  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.remove(quarantineDir);
    await fs.remove(warmupQueueDir);
    await fs.remove(warmupSettingsDir);
    await fs.ensureDir(k8sDir);
    doctorEvaluateMock.mockResolvedValue({
      healthScore: 62,
      status: 'watch',
      overlap: {
        sharedFingerprintCount: 1,
        sharedProxyCount: 1,
        sampleProfiles: [{ id: 'clone-1', name: 'Clone' }],
      },
      recommendations: ['Decouple the profile before heavy use.'],
    });
    timelineGetMock.mockResolvedValue({
      items: [{ at: new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString(), title: 'snapshot.created', severity: 'info' }],
      heatmap: [],
    });
    reputationScoreMock.mockResolvedValue({
      reputationScore: 58,
      tier: 'fragile',
      notes: ['Warm it before the next large run.'],
    });
  });

  afterEach(async () => {
    await fs.remove(quarantineDir);
    await fs.remove(warmupQueueDir);
    await fs.remove(warmupSettingsDir);
  });

  it('quarantines and releases a profile', async () => {
    const state = await ProfileQuarantineService.quarantine(profileId, tenantId, 'user-1', 'suspicious access');
    expect(state.active).toBe(true);
    await expect(ProfileQuarantineService.assertLaunchAllowed(profileId)).rejects.toThrow(/quarantined/i);

    const released = await ProfileQuarantineService.release(profileId, tenantId, 'user-1');
    expect(released.active).toBe(false);
    await expect(ProfileQuarantineService.assertLaunchAllowed(profileId)).resolves.toBeUndefined();
  });

  it('applies a decouple plan to reseed a profile', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      id: profileId,
      fingerprint: { canvasSeed: 'seed-old', hardwareConcurrency: 8, webglVendor: 'Vendor', webglRenderer: 'Renderer' },
      proxyConfig: { host: '1.1.1.1', port: 1000 },
      fingerprintPresetId: 'preset-a',
      name: 'Primary',
    });
    prismaMock.profile.update.mockResolvedValue({});

    const result = await ProfileDecoupleAssistantService.apply(profileId, tenantId, 'user-2');

    expect(result.applied).toBe(true);
    expect(prismaMock.profile.update).toHaveBeenCalled();
    const updateArg = prismaMock.profile.update.mock.calls[0][0];
    expect(updateArg.data.fingerprint.canvasSeed).not.toBe('seed-old');
  });

  it('builds a safe allowlisted sandbox flow intent draft', async () => {
    xaiChatMock.mockResolvedValue(JSON.stringify({
      name: 'Internal Flow',
      sandboxOnly: true,
      host: 'localhost',
      steps: [{ type: 'navigate', config: { url: 'https://localhost' } }],
    }));

    const result = await IntentFlowSandboxService.generate(tenantId, 'open the dashboard and capture a screenshot', 'localhost');
    expect(result.sandboxOnly).toBe(true);
    expect(result.host).toBe('localhost');
  });

  it('returns a k8s readiness snapshot from manifests', async () => {
    await fs.writeFile(path.join(k8sDir, 'api-deployment.yaml'), 'api');
    await fs.writeFile(path.join(k8sDir, 'worker-deployment.yaml'), 'worker');
    await fs.writeFile(path.join(k8sDir, 'ingress.yaml'), 'ingress');
    await fs.writeFile(path.join(k8sDir, 'autoscaling.yaml'), 'autoscaling');

    const result = await KubernetesReadinessService.getSnapshot();
    expect(result.manifestCount).toBeGreaterThan(0);
    expect(['ready', 'caution', 'blocked']).toContain(result.status);
  });

  it('produces a predictive warmup plan', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      id: profileId,
      name: 'Warmup',
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      platform: 'DESKTOP',
      fingerprint: { canvasSeed: 'seed-a', webglVendor: 'Vendor', webglRenderer: 'Renderer' },
      proxyConfig: { host: '2.2.2.2', port: 2000 },
      fingerprintPresetId: 'preset-b',
    });
    const plan = await PredictiveWarmupService.planForProfile(profileId, tenantId);
    expect(['none', 'light', 'moderate', 'overnight']).toContain(plan.mode);
    expect(Array.isArray(plan.reasons)).toBe(true);
    expect(Array.isArray(plan.steps)).toBe(true);
    expect(typeof plan.estimatedDurationMinutes).toBe('number');
  });

  it('produces a structured internal doctor diagnosis', async () => {
    xaiChatMock.mockRejectedValue(new Error('fallback'));
    const diagnosis = await ProfileDoctorAiService.diagnose(profileId, tenantId);

    expect(['low', 'medium', 'high', 'critical']).toContain(diagnosis.severity);
    expect(['launch_ready', 'warmup_first', 'hold', 'blocked']).toContain(diagnosis.launchRecommendation);
    expect(Array.isArray(diagnosis.signals)).toBe(true);
    expect(diagnosis.safeAutofixPlan).toBeTruthy();
  });

  it('builds, approves and learns from the nightly warmup queue', async () => {
    prismaMock.profile.findMany.mockResolvedValue([{ id: profileId, name: 'Warmup' }]);
    const queue = await PredictiveWarmupQueueService.rebuildNightlyQueue(tenantId, 'user-3');
    expect(queue.items.length).toBeGreaterThan(0);
    const entry = queue.items[0];
    expect(['pending_approval', 'queued']).toContain(entry.status);

    const approved = await PredictiveWarmupQueueService.approveEntry(tenantId, entry.id, 'user-3');
    expect(['queued', 'running', 'completed']).toContain(approved.status);

    const feedback = await PredictiveWarmupQueueService.recordFeedback(tenantId, entry.id, 'user-3', {
      outcome: 'improved',
      deltaScore: 7,
      notes: 'Warmup improved launch readiness',
    });
    expect(feedback.feedback.outcome).toBe('improved');

    const snapshot = await PredictiveWarmupQueueService.listQueue(tenantId);
    expect(snapshot.learning.improved).toBeGreaterThanOrEqual(1);
  });
});

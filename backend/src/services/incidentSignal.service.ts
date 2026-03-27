import { prisma } from '../prisma';
import { PromotionTaskService } from './promotionTask.service';
import { ReleaseGateService } from './releaseGate.service';
import { MemoryAdmissionService } from './memoryAdmission.service';
import { SandboxCompatibilityLabService } from './sandboxCompatibilityLab.service';
import { QueueService } from './queue.service';
import { RuntimeHardeningService } from './runtimeHardening.service';
import { SecurityPostureService } from './securityPosture.service';

export class IncidentSignalService {
  static async collect(tenantId: string) {
    const [releaseGates, promotionTasks, sandboxLab, presets, profiles, queueDepth, securityPosture] = await Promise.all([
      ReleaseGateService.getSnapshot(tenantId),
      PromotionTaskService.list(tenantId),
      SandboxCompatibilityLabService.evaluateAll(tenantId),
      (prisma.fingerprintPreset as any).findMany({
        where: { tenantId },
        select: { id: true, name: true, platform: true, browser: true, config: true },
      }),
      (prisma.profile as any).findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          platform: true,
          proxyConfig: true,
          fingerprint: true,
          fingerprintPresetId: true,
        },
      }),
      QueueService.getRuntimeStats(),
      SecurityPostureService.getSnapshot(tenantId),
    ]);

    return {
      releaseGates,
      promotionAlerts: PromotionTaskService.summarize(promotionTasks),
      memoryAdmission: MemoryAdmissionService.snapshot(),
      sandboxLab: sandboxLab.summary,
      queueDepth,
      runtimeHardening: RuntimeHardeningService.buildSnapshot(presets, profiles),
      securityPosture,
    };
  }
}

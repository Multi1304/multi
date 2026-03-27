import os from 'os';
import { config } from '../config';
import { ScaleMetricsService } from './scaleMetrics.service';

export interface MemoryAdmissionSnapshot {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  freeSystemMb: number;
  maxRssMb: number;
  reserveMb: number;
  admitted: boolean;
}

export class MemoryAdmissionService {
  private static getPolicy() {
    return {
      enabled: config.memoryAdmission?.enabled ?? true,
      maxRssMb: config.memoryAdmission?.maxRssMb ?? 900,
      reserveMb: config.memoryAdmission?.reserveMb ?? 128,
    };
  }

  static snapshot(): MemoryAdmissionSnapshot {
    const memory = process.memoryUsage();
    const rssMb = Math.round(memory.rss / 1024 / 1024);
    const heapUsedMb = Math.round(memory.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(memory.heapTotal / 1024 / 1024);
    const freeSystemMb = Math.round(os.freemem() / 1024 / 1024);
    const policy = this.getPolicy();
    const admitted = !policy.enabled
      ? true
      : rssMb < policy.maxRssMb && freeSystemMb > policy.reserveMb;

    return {
      rssMb,
      heapUsedMb,
      heapTotalMb,
      freeSystemMb,
      maxRssMb: policy.maxRssMb,
      reserveMb: policy.reserveMb,
      admitted,
    };
  }

  static async recordSnapshot(scope: string) {
    const snap = this.snapshot();
    await Promise.all([
      ScaleMetricsService.setGauge(`memory:${scope}:rss_mb`, snap.rssMb),
      ScaleMetricsService.setGauge(`memory:${scope}:heap_used_mb`, snap.heapUsedMb),
      ScaleMetricsService.setGauge(`memory:${scope}:free_system_mb`, snap.freeSystemMb),
    ]);
    return snap;
  }

  static async assertCapacity(scope: string) {
    const snap = await this.recordSnapshot(scope);
    if (!snap.admitted) {
      await ScaleMetricsService.incrementCounter(`memory:${scope}:admission_denied`);
      throw new Error(
        `Memory admission denied for ${scope}: rss=${snap.rssMb}MB free=${snap.freeSystemMb}MB`
      );
    }
    return snap;
  }
}

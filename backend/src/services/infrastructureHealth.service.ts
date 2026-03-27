import { config } from '../config';
import { redis } from '../utils/redis';

export interface InfrastructureHealthSnapshot {
  overallScore: number;
  status: 'healthy' | 'warning' | 'critical';
  components: {
    redis: {
      connected: boolean;
      version: string | null;
      minimumRecommended: string;
      recommendedImage: string;
      host: string;
      port: number;
      meetsMinimum: boolean;
      upgradeRequired: boolean;
      detail: string;
    };
    worker: {
      concurrency: number;
      detail: string;
    };
    memoryAdmission: {
      enabled: boolean;
      maxRssMb: number;
      reserveMb: number;
      detail: string;
    };
    objectStorage: {
      provider: string;
      configured: boolean;
      detail: string;
    };
  };
  recommendations: string[];
  userGuidance: {
    summary: string;
    nextAction: string;
  };
}

export class InfrastructureHealthService {
  private static readonly REDIS_MINIMUM = '6.2.0';
  private static readonly REDIS_RECOMMENDED_IMAGE = 'redis:7.2-alpine';

  static async getSnapshot(): Promise<InfrastructureHealthSnapshot> {
    const redisProbe = await this.probeRedis();
    const workerConcurrency = Number(config.worker.concurrency || 1);
    const objectStorageConfigured = config.objectStorage.provider === 'filesystem'
      ? true
      : Boolean(config.objectStorage.bucket && config.objectStorage.accessKeyId && config.objectStorage.secretAccessKey);

    const componentScores = [
      redisProbe.connected ? (redisProbe.meetsMinimum ? 96 : 42) : 18,
      workerConcurrency >= 3 ? 88 : 72,
      config.memoryAdmission.enabled ? 92 : 38,
      objectStorageConfigured ? 85 : 64,
    ];
    const overallScore = Math.round(componentScores.reduce((sum, item) => sum + item, 0) / componentScores.length);
    const recommendations: string[] = [];

    if (!redisProbe.connected) {
      recommendations.push('Reconnect Redis before trusting queue durability or release gates.');
    } else if (!redisProbe.meetsMinimum) {
      recommendations.push(`Upgrade Redis to ${this.REDIS_RECOMMENDED_IMAGE} or any version >= ${this.REDIS_MINIMUM}.`);
    }

    if (!config.memoryAdmission.enabled) {
      recommendations.push('Enable memory admission to protect modest machines from profile overload.');
    }

    if (!objectStorageConfigured && config.objectStorage.provider !== 'filesystem') {
      recommendations.push('Complete object storage credentials before relying on shared profile persistence.');
    }

    if (workerConcurrency > 10) {
      recommendations.push('Reduce worker concurrency or raise memory headroom before large concurrent launches.');
    }

    const status: InfrastructureHealthSnapshot['status'] =
      !redisProbe.connected || !redisProbe.meetsMinimum
        ? 'critical'
        : overallScore >= 85
          ? 'healthy'
          : 'warning';

    const nextAction = !redisProbe.connected
      ? 'Restore Redis connectivity first.'
      : !redisProbe.meetsMinimum
        ? `Move the runtime to ${this.REDIS_RECOMMENDED_IMAGE}.`
        : !config.memoryAdmission.enabled
          ? 'Turn on memory admission before scaling concurrency.'
          : 'Infrastructure is healthy enough to continue with scale validation.';

    return {
      overallScore,
      status,
      components: {
        redis: {
          connected: redisProbe.connected,
          version: redisProbe.version,
          minimumRecommended: this.REDIS_MINIMUM,
          recommendedImage: this.REDIS_RECOMMENDED_IMAGE,
          host: config.redis.host,
          port: config.redis.port,
          meetsMinimum: redisProbe.meetsMinimum,
          upgradeRequired: redisProbe.connected ? !redisProbe.meetsMinimum : true,
          detail: redisProbe.connected
            ? redisProbe.meetsMinimum
              ? `Redis ${redisProbe.version} satisfies BullMQ guidance.`
              : `Redis ${redisProbe.version || 'unknown'} is below the recommended ${this.REDIS_MINIMUM}.`
            : 'Redis could not be reached from the API runtime.',
        },
        worker: {
          concurrency: workerConcurrency,
          detail: `Queue worker concurrency is set to ${workerConcurrency}.`,
        },
        memoryAdmission: {
          enabled: config.memoryAdmission.enabled,
          maxRssMb: config.memoryAdmission.maxRssMb,
          reserveMb: config.memoryAdmission.reserveMb,
          detail: config.memoryAdmission.enabled
            ? `Admission enabled with ${config.memoryAdmission.maxRssMb}MB max RSS and ${config.memoryAdmission.reserveMb}MB reserve.`
            : 'Admission controller is disabled.',
        },
        objectStorage: {
          provider: config.objectStorage.provider,
          configured: objectStorageConfigured,
          detail: config.objectStorage.provider === 'filesystem'
            ? 'Filesystem mode is active for local persistence.'
            : objectStorageConfigured
              ? `S3-compatible storage is configured for bucket ${config.objectStorage.bucket}.`
              : 'S3-compatible provider selected but credentials or bucket are incomplete.',
        },
      },
      recommendations,
      userGuidance: {
        summary: status === 'healthy'
          ? 'Infrastructure is healthy and ready for sustained validation.'
          : status === 'warning'
            ? 'Infrastructure is usable but still has scale-risk warnings.'
            : 'Infrastructure has blockers that should be fixed before trusting high-scale runs.',
        nextAction,
      },
    };
  }

  static compareVersions(current: string | null | undefined, minimum: string) {
    if (!current) return false;
    const parse = (value: string) => value.split('.').map((part) => Number(part.replace(/[^\d]/g, '')) || 0);
    const [ca = 0, cb = 0, cc = 0] = parse(current);
    const [ma = 0, mb = 0, mc = 0] = parse(minimum);
    if (ca !== ma) return ca > ma;
    if (cb !== mb) return cb > mb;
    return cc >= mc;
  }

  private static async probeRedis() {
    try {
      const info = await redis.info('server');
      const version = String(info.match(/redis_version:(.+)/)?.[1] || '').trim() || null;
      return {
        connected: true,
        version,
        meetsMinimum: this.compareVersions(version, this.REDIS_MINIMUM),
      };
    } catch (_error) {
      return {
        connected: false,
        version: null,
        meetsMinimum: false,
      };
    }
  }
}

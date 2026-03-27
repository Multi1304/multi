import { prisma } from '../prisma';
import { redis } from '../utils/redis';

export type Provider = 'groq' | 'ollama';
export type TaskType = 'general' | 'doctor' | 'sandbox_advisor' | 'intent_flow' | 'batch_nightly';

export type AiRoutingSettings = {
  preferredProvider: Provider;
  fallbackProvider: Provider;
  taskPreferences: Record<TaskType, Provider[]>;
  softDailyRequestBudget: number;
  softDailyTokenBudget: number;
};

export type AiRoutingSettingsUpdate = Partial<Omit<AiRoutingSettings, 'taskPreferences'>> & {
  taskPreferences?: Partial<Record<TaskType, Provider[]>>;
};

const DEFAULT_SETTINGS: AiRoutingSettings = {
  preferredProvider: 'groq',
  fallbackProvider: 'ollama',
  taskPreferences: {
    general: ['groq', 'ollama'],
    doctor: ['groq', 'ollama'],
    sandbox_advisor: ['groq', 'ollama'],
    intent_flow: ['groq', 'ollama'],
    batch_nightly: ['ollama', 'groq'],
  },
  softDailyRequestBudget: 500,
  softDailyTokenBudget: 500000,
};

export class AiRoutingService {
  private static usageKey(tenantId: string, day: string) {
    return `v3:ai:routing:${tenantId}:${day}`;
  }

  static async getSettings(tenantId: string): Promise<AiRoutingSettings> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const raw = (tenant?.settings as any)?.aiRouting || {};
    return {
      preferredProvider: raw.preferredProvider === 'ollama' ? 'ollama' : DEFAULT_SETTINGS.preferredProvider,
      fallbackProvider: raw.fallbackProvider === 'groq' ? 'groq' : DEFAULT_SETTINGS.fallbackProvider,
      taskPreferences: {
        ...DEFAULT_SETTINGS.taskPreferences,
        ...(raw.taskPreferences || {}),
      },
      softDailyRequestBudget: typeof raw.softDailyRequestBudget === 'number' ? raw.softDailyRequestBudget : DEFAULT_SETTINGS.softDailyRequestBudget,
      softDailyTokenBudget: typeof raw.softDailyTokenBudget === 'number' ? raw.softDailyTokenBudget : DEFAULT_SETTINGS.softDailyTokenBudget,
    };
  }

  static async updateSettings(tenantId: string, partial: AiRoutingSettingsUpdate) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    const current = await this.getSettings(tenantId);
    const next = {
      ...current,
      ...partial,
      taskPreferences: {
        ...current.taskPreferences,
        ...(partial.taskPreferences || {}),
      },
    };
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...((tenant.settings as any) || {}),
          aiRouting: next,
        } as any,
      },
    });
    return next;
  }

  static async getProviderOrder(tenantId: string, taskType: TaskType = 'general') {
    const settings = await this.getSettings(tenantId);
    const fromTask = settings.taskPreferences[taskType] || settings.taskPreferences.general;
    const order = [...fromTask, settings.preferredProvider, settings.fallbackProvider].filter((value, index, arr) => arr.indexOf(value) === index) as Provider[];
    return { settings, order };
  }

  static estimateTokens(text: string) {
    return Math.max(1, Math.ceil(String(text || '').length / 4));
  }

  static async recordUsage(input: {
    tenantId: string;
    provider: Provider;
    taskType?: TaskType;
    prompt: string;
    completion: string;
    usedFallback?: boolean;
  }) {
    const day = new Date().toISOString().slice(0, 10);
    const key = this.usageKey(input.tenantId, day);
    const promptTokens = this.estimateTokens(input.prompt);
    const completionTokens = this.estimateTokens(input.completion);
    await redis.hincrby(key, 'requests', 1);
    await redis.hincrby(key, 'promptTokens', promptTokens);
    await redis.hincrby(key, 'completionTokens', completionTokens);
    await redis.hincrby(key, `provider:${input.provider}`, 1);
    await redis.hincrby(key, `task:${input.taskType || 'general'}`, 1);
    if (input.usedFallback) {
      await redis.hincrby(key, 'fallbacks', 1);
    }
    await redis.expire(key, 14 * 24 * 60 * 60);
    return { promptTokens, completionTokens };
  }

  static async getSnapshot(tenantId: string) {
    const settings = await this.getSettings(tenantId);
    const day = new Date().toISOString().slice(0, 10);
    const raw = await redis.hgetall(this.usageKey(tenantId, day));
    const requests = Number(raw.requests || 0);
    const promptTokens = Number(raw.promptTokens || 0);
    const completionTokens = Number(raw.completionTokens || 0);
    const totalTokens = promptTokens + completionTokens;
    return {
      settings,
      today: {
        requests,
        promptTokens,
        completionTokens,
        totalTokens,
        providerMix: {
          groq: Number(raw['provider:groq'] || 0),
          ollama: Number(raw['provider:ollama'] || 0),
        },
        taskMix: {
          general: Number(raw['task:general'] || 0),
          doctor: Number(raw['task:doctor'] || 0),
          sandbox_advisor: Number(raw['task:sandbox_advisor'] || 0),
          intent_flow: Number(raw['task:intent_flow'] || 0),
          batch_nightly: Number(raw['task:batch_nightly'] || 0),
        },
        fallbacks: Number(raw.fallbacks || 0),
      },
      budgetStatus: {
        requestPressure: requests >= settings.softDailyRequestBudget ? 'high' : requests >= Math.round(settings.softDailyRequestBudget * 0.8) ? 'medium' : 'low',
        tokenPressure: totalTokens >= settings.softDailyTokenBudget ? 'high' : totalTokens >= Math.round(settings.softDailyTokenBudget * 0.8) ? 'medium' : 'low',
      },
      nightlyBatchRecommendation: this.getNightlyBatchRecommendation({
        settings,
        requests,
        totalTokens,
        fallbacks: Number(raw.fallbacks || 0),
      }),
    };
  }

  private static getNightlyBatchRecommendation(input: {
    settings: AiRoutingSettings;
    requests: number;
    totalTokens: number;
    fallbacks: number;
  }) {
    const requestPressure = input.requests / Math.max(1, input.settings.softDailyRequestBudget);
    const tokenPressure = input.totalTokens / Math.max(1, input.settings.softDailyTokenBudget);
    const shouldPreferOllama =
      input.settings.taskPreferences.batch_nightly?.[0] === 'ollama' ||
      requestPressure >= 0.6 ||
      tokenPressure >= 0.6 ||
      input.fallbacks > 0;

    return {
      provider: shouldPreferOllama ? 'ollama' : 'groq',
      reason: shouldPreferOllama
        ? 'Nightly batches should prefer Ollama to preserve Groq headroom for operator-facing tasks.'
        : 'Groq still has enough headroom, but you can move overnight work to Ollama later if usage grows.',
    };
  }
}

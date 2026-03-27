import { config } from '../config';
import { logger } from '../utils/logger';
import { GroqService } from './groq.service';
import { OllamaService } from './ollama.service';
import { AiRoutingService } from './aiRouting.service';

type Provider = 'groq' | 'ollama';
type TaskType = 'general' | 'doctor' | 'sandbox_advisor' | 'intent_flow' | 'batch_nightly';

export class AiRouterService {
  static async chat(prompt: string, systemPrompt: string, options?: { tenantId?: string; taskType?: TaskType }) {
    const result = await this.chatWithMeta(prompt, systemPrompt, options);
    return result.content;
  }

  static async chatWithMeta(prompt: string, systemPrompt: string, options?: { tenantId?: string; taskType?: TaskType }) {
    const tenantId = options?.tenantId || 'global';
    const taskType = options?.taskType || 'general';
    const fromTenant = await AiRoutingService.getProviderOrder(tenantId, taskType).catch(() => null);
    const preferred = this.normalizeProvider(process.env.AI_PREFERRED_PROVIDER || fromTenant?.settings?.preferredProvider || config.ai.preferredProvider);
    const fallback = this.normalizeProvider(process.env.AI_FALLBACK_PROVIDER || fromTenant?.settings?.fallbackProvider || config.ai.fallbackProvider);
    const ordered = fromTenant?.order?.length
      ? fromTenant.order as Provider[]
      : [preferred, fallback].filter((value, index, arr) => arr.indexOf(value) === index) as Provider[];

    const errors: string[] = [];
    for (let index = 0; index < ordered.length; index += 1) {
      const provider = ordered[index];
      try {
        const content = provider === 'groq'
          ? await GroqService.chat(prompt, systemPrompt)
          : await OllamaService.chat(prompt, systemPrompt);
        await AiRoutingService.recordUsage({
          tenantId,
          provider,
          taskType,
          prompt,
          completion: content,
          usedFallback: index > 0,
        }).catch(() => null);
        return { provider, content };
      } catch (error: any) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('AI provider failed', { provider, error: message });
        errors.push(`${provider}: ${message}`);
      }
    }

    throw new Error(`No AI provider available (${errors.join(' | ')})`);
  }

  private static normalizeProvider(value: string): Provider {
    return String(value || '').toLowerCase() === 'ollama' ? 'ollama' : 'groq';
  }
}

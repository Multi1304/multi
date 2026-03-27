import { XaiService } from './xai.service';
import { ProductionRuntimeEmulationService } from './productionRuntimeEmulation.service';
import { SandboxRuntimeEmulationService } from './sandboxRuntimeEmulation.service';

export class IntentFlowSandboxService {
  static async generate(tenantId: string, prompt: string, targetHost: string) {
    const [sandboxSettings, productionSettings] = await Promise.all([
      SandboxRuntimeEmulationService.getSettings(tenantId).catch(() => null),
      ProductionRuntimeEmulationService.getSettings(tenantId).catch(() => null),
    ]);

    const allowedHosts = new Set([
      ...(sandboxSettings?.allowedHosts || []),
      ...(productionSettings?.allowedHosts || []),
    ].map((item) => String(item).toLowerCase()));

    const normalizedHost = String(targetHost || '').toLowerCase();
    if (!normalizedHost || !allowedHosts.has(normalizedHost)) {
      throw new Error('Intent flow generation is restricted to internal or allowlisted hosts.');
    }

    const safePrompt = `Create a JSON Camel flow draft for an internal or sandbox host.
Host: ${normalizedHost}
Operator intent: ${prompt}
Rules:
- Only use generic internal automation steps.
- Do not include stealth, ban-evasion, captcha-bypass, SMS-bypass, or third-party abuse tactics.
- Return JSON with keys name, sandboxOnly, host, steps.`;

    try {
      const raw = await XaiService.chat(
        safePrompt,
        'You are Camel internal flow composer. Only generate safe automation drafts for internal or allowlisted hosts. Return JSON only.',
        { tenantId, taskType: 'intent_flow' }
      );
      return JSON.parse(raw);
    } catch {
      return {
        name: 'Sandbox Draft',
        sandboxOnly: true,
        host: normalizedHost,
        steps: [
          { type: 'navigate', config: { url: `https://${normalizedHost}` } },
          { type: 'wait', config: { duration: 1500 } },
          { type: 'screenshot', config: {} },
        ],
      };
    }
  }
}

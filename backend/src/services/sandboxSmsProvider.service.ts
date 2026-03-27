import { SandboxAutomationService } from './sandboxAutomation.service';

export class SandboxSmsProviderService {
  static async createChallenge(tenantId: string, prompt: string, payload?: Record<string, any>) {
    return SandboxAutomationService.issueChallenge(tenantId, 'sms', prompt, payload);
  }

  static async resolveChallenge(tenantId: string, challengeId: string, code: string, mode: 'manual' | 'stub_auto' = 'manual') {
    return SandboxAutomationService.resolveChallenge(tenantId, challengeId, {
      type: 'sms',
      code,
      mode,
    });
  }
}

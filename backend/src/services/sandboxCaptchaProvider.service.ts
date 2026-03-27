import { SandboxAutomationService } from './sandboxAutomation.service';

export class SandboxCaptchaProviderService {
  static async createChallenge(tenantId: string, prompt: string, payload?: Record<string, any>) {
    return SandboxAutomationService.issueChallenge(tenantId, 'captcha', prompt, payload);
  }

  static async resolveChallenge(tenantId: string, challengeId: string, value: string, mode: 'manual' | 'stub_auto' = 'manual') {
    return SandboxAutomationService.resolveChallenge(tenantId, challengeId, {
      type: 'captcha',
      value,
      mode,
    });
  }
}

import { AiRouterService } from './aiRouter.service';

export class XaiService {
  static async chat(
    prompt: string,
    systemPrompt: string = 'You are an RPA and Anti-Detect expert.',
    options?: { tenantId?: string; taskType?: 'general' | 'doctor' | 'sandbox_advisor' | 'intent_flow' | 'batch_nightly' }
  ) {
    return AiRouterService.chat(prompt, systemPrompt, options);
  }

  static async generateEvasion(fingerprint: any) {
    const prompt = `Analyze this browser fingerprint for potential detection vectors and suggest counter-measures. 
    Return a JSON object with: canvasSeed (number), hardwareConcurrency (number), audioPerturbation (number), webglVendor (string), webglRenderer (string).
    
    Fingerprint: ${JSON.stringify(fingerprint)}`;

    const result = await this.chat(prompt, 'You are a stealth browser evasion specialist.');
    return JSON.parse(result);
  }
}

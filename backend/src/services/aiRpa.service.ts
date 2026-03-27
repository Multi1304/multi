import { logger } from '../utils/logger';
import { XaiService } from './xai.service';

export class AiRpaService {
  /**
   * Executes a Grok-powered Smart Prompt for RPA flow generation.
   */
  static async executePrompt(prompt: string, context: { profileName: string; platform: string; engine?: string }) {
    logger.info('Executing Grok-Powered Smart Prompt', { prompt, ...context });

    try {
      const systemPrompt = `You are an expert RPA architect for CamelFarm. 
      Convert the user's goal into a highly optimized automation flow.
      Include error handling and advanced branching logic. 
      If a Captcha is suspected, suggest using the 2Captcha API integration.
      Output valid JSON array of steps: {type: string, config: object}.`;

      const gResult = await XaiService.chat(prompt, systemPrompt);
      const parsed = JSON.parse(gResult);
      
      return parsed;
    } catch (error: any) {
      logger.error('Grok RPA Generation Failed', { error: error.message });
      return [{ type: 'navigate', config: { url: `https://www.google.com/search?q=${encodeURIComponent(prompt)}` } }];
    }
  }
}

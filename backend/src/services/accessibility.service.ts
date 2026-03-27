import { XaiService } from './xai.service';
import { logger } from '../utils/logger';

export class AccessibilityService {
  /**
   * Converts a voice transcript into a structured automation flow using Grok.
   */
  static async voiceToFlow(transcript: string) {
    logger.info('Converting voice to flow via Grok', { transcript });
    
    const prompt = `Acting as an RPA expert for CamelFarm, convert this goal into a JSON array of steps.
    Supported types and their exact config structures:
    - {"type": "navigate", "config": {"url": "https://url.com"}}
    - {"type": "click", "config": {"selector": "css-selector"}}
    - {"type": "type", "config": {"selector": "css-selector", "text": "value"}}
    - {"type": "wait", "config": {"duration": number_in_ms}}
    
    Goal: "${transcript}"
    
    Return ONLY the JSON array. Do not include explanations.`;
    
    try {
      const gResult = await XaiService.chat(prompt, 'You are a precise RPA compiler.');
      // Extract JSON if it contains markdown markers (Grok sometimes does this)
      let cleanJson = gResult.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.split('\n').slice(1, -1).join('\n').trim();
      }
      const steps = JSON.parse(cleanJson);
      if (!Array.isArray(steps)) {
        throw new Error('AI did not return a JSON array.');
      }
      return { success: true, steps };
    } catch (error: any) {
      logger.error('Voice-to-Flow Grok Failure', { error: error.message });
      return { success: false, error: `AI Agent Failure: ${error.message}` };
    }
  }
}

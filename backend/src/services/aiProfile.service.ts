import { XaiService } from './xai.service';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';

let profileTemplates: any[] = [];
try {
  const candidates = [
    path.join(__dirname, '../utils/profileTemplates.json'),
    path.resolve(process.cwd(), 'src/utils/profileTemplates.json'),
  ];
  const templatePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!templatePath) {
    throw new Error(`profileTemplates.json not found in ${candidates.join(', ')}`);
  }
  profileTemplates = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
} catch (e) {
  logger.warn('Could not load profileTemplates.json', { error: e });
}

export class AiProfileService {
  /**
   * Generates a profile configuration based on a semantic request.
   */
  static async suggestProfileFromSemanticPrompt(prompt: string) {
    logger.info('Generating semantic profile suggestion via Grok', { prompt });
    
    const systemPrompt = "You are a CamelFarm profile architect. Return ONLY a JSON object with templateName and overrides.";
    const payload = `User Request: "${prompt}". Available Templates: ${profileTemplates.map(t => t.name).join(', ')}`;
    
    try {
      const response = await XaiService.chat(payload, systemPrompt);
      let cleanJson = response.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.split('\n').slice(1, -1).join('\n').trim();
      }
      return JSON.parse(cleanJson);
    } catch (e) {
      logger.error('Failed to generate semantic profile via Grok', { error: e });
      return {
        templateName: "Windows Chrome 2026 (Marketer USA)",
        overrides: {}
      };
    }
  }

  /**
   * Analyzes an existing fingerprint and suggests consistency improvements/evasion tactics.
   */
  static async checkFingerprintConsistency(fingerprint: any) {
    logger.info('Checking fingerprint consistency via Grok');
    
    const prompt = `Analyze this browser fingerprint for anti-bot detection risks and suggest improvements: ${JSON.stringify(fingerprint)}`;
    const systemPrompt = "You are a senior anti-detect analyst. Return ONLY a JSON object: {risk_assessment: 'low'|'medium'|'high', explanation: string, improvements: string[]}";

    try {
      const response = await XaiService.chat(prompt, systemPrompt);
      let cleanJson = response.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.split('\n').slice(1, -1).join('\n').trim();
      }
      return JSON.parse(cleanJson);
    } catch (e) {
      logger.error('Fingerprint consistency check failed', { error: e });
      return { risk_assessment: "medium", explanation: "Intelligence offline." };
    }
  }

  /**
   * Recommends an automation flow based on user intent.
   */
  static async recommendFlow(goal: string) {
    logger.info('Generating flow recommendation via Grok', { goal });
    const prompt = `Recommend a multi-step RPA flow for this goal: "${goal}". Return a JSON object with a "steps" array of strings.`;
    
    try {
      const response = await XaiService.chat(prompt, "You are a CamelFarm automation specialist.");
      return JSON.parse(response);
    } catch (e) {
      return { steps: ["Navigate to URL", "Wait for element", "Click primary button"], error: "Could not generate custom flow." };
    }
  }
}

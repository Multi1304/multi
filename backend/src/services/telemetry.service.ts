import { XaiService } from './xai.service';
import { logger } from '../utils/logger';
import { prisma } from '../prisma';

export class TelemetryService {
  /**
   * Analyzes session logs and provides proactive anti-ban insights using Grok.
   */
  static async analyzeSession(profileId: string, logs: string[]) {
    logger.info('Analyzing session telemetry with Grok', { profileId });

    try {
      const prompt = `Analyze these session logs for potential detection by anti-bot systems. 
      Provide 3-5 specific, bulleted insights on how to improve the fingerprint or behavior to lower the ban risk.
      
      Logs:
      ${logs.join('\n').substring(0, 2000)}`;

      const systemPrompt = "You are a senior anti-detect analyst. Provide high-fidelity, actionable insights.";
      
      const insights = await XaiService.chat(prompt, systemPrompt);
      
      // Fetch profile to satisfy AuditLog relation requirements
      const profile = await prisma.profile.findUnique({
        where: { id: profileId },
        select: { tenantId: true, userId: true }
      });

      // Store insights in DB for the dashboard
      if (profile) {
        await prisma.auditLog.create({
          data: {
            tenantId: profile.tenantId,
            userId: profile.userId,
            action: 'TELEMETRY_INSIGHT',
            resource: `profile:${profileId}`,
            detail: { profileId, insights },
            ip: '127.0.0.1'
          }
        });
      }

      return insights;
    } catch (error: any) {
      logger.error('Telemetry Analysis Failed', { error: error.message });
      return "Unable to generate insights at this moment.";
    }
  }

  /**
   * Health-check based on Grok's opinion of the current profile config.
   */
  static async getProfileHealth(config: any) {
    const prompt = `Rate the stealth health (0-100) of this profile configuration: ${JSON.stringify(config)}`;
    const result = await XaiService.chat(prompt, "Return a JSON object: {score: number, reasoning: string}");
    return JSON.parse(result);
  }
}

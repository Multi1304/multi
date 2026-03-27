import { XaiService } from './xai.service';
import { logger } from '../utils/logger';

export class XSearchService {
  /**
   * Leverages Grok's real-time access to X (Twitter) to analyze platform-specific ban trends.
   */
  static async analyzePlatformTrends(platform: string) {
    logger.info(`Analyzing X trends for platform: ${platform} via Grok`);

    const prompt = `Search for the latest discussions, developer complaints, and anti-bot update news on X (Twitter) regarding "${platform}" detection of automated browsers or headles scrapers.
    
    Return a JSON object with:
    - riskLevel: "Low" | "Medium" | "High"
    - summary: A brief summary of the findings (max 200 chars)
    - remediation: A specific technical suggestion to avoid detection (e.g. "Update canvas noise", "Change WebGL renderer")
    - latestUpdateDate: Estimated date of the latest anti-bot change (e.g. "2026-03-10")`;

    try {
      const systemPrompt = "You are a cyber-intelligence expert with real-time access to X data. Provide precise, actionable anti-detect intelligence.";
      const resultText = await XaiService.chat(prompt, systemPrompt);
      
      // Handle potential markdown fences from Grok
      let cleanJson = resultText.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.split('\n').slice(1, -1).join('\n').trim();
      }
      
      return JSON.parse(cleanJson);
    } catch (error: any) {
      logger.error(`X Search Analysis failed for ${platform}`, { error: error.message });
      return {
        riskLevel: "Medium",
        summary: "Unable to reach live X intelligence. Displaying baseline heuristic risk.",
        remediation: "Apply standard High-Entropy fingerprints.",
        latestUpdateDate: new Date().toISOString().split('T')[0]
      };
    }
  }

  /**
   * Scans a specific domain for latest WAF (Web Application Firewall) updates.
   */
  static async scanDomain(domain: string) {
    const prompt = `Analyze current WAF protection trends for ${domain} based on recent X (Twitter) activity from the web scraping and anti-detect communities.`;
    return XaiService.chat(prompt, "You are a WAF analyst. Provide a brief technical summary.");
  }
}

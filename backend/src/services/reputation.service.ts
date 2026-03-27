import { logger } from '../utils/logger';

export interface ReputationScore {
  score: number; // 0 (Worst) to 100 (Best)
  isRisky: boolean;
  recommendations: string[];
}

export class ReputationService {
  /**
   * Simulates an ML-based reputation check for an IP or Fingerprint.
   * In a production V2, this would call external APIs or internal ML models.
   */
  static async checkIPReputation(ip: string): Promise<ReputationScore> {
    logger.info('Analyzing IP reputation', { ip });
    
    // Logic: In V2.4/2.5 we use heuristic "mock" logic
    // IPs commonly used by datacenters get lower scores
    const isDatacenter = ip.startsWith('10.') || ip.startsWith('192.') || ip.startsWith('172.');
    
    if (isDatacenter) {
      return {
        score: 35,
        isRisky: true,
        recommendations: ['Use a residential proxy instead', 'Rotate to a mobile carrier IP']
      };
    }

    return {
      score: 85,
      isRisky: false,
      recommendations: ['Safe for most operations']
    };
  }

  /**
   * Checks if a fingerprint is "suspiciously perfect" or inconsistent.
   */
  static checkFingerprintConsistency(fp: any): ReputationScore {
    const recommendations: string[] = [];
    let score = 100;

    // Check for inconsistent user-agent vs platform
    if (fp.userAgent.includes('Windows') && fp.platformOS === 'macOS') {
      score -= 40;
      recommendations.push('Inconsistent platform vs user-agent');
    }

    // Check for "perfect" hardware concurrency
    if (fp.hardwareConcurrency === 128) {
      score -= 20;
      recommendations.push('Hardware concurrency is suspiciously high');
    }

    return {
      score,
      isRisky: score < 70,
      recommendations
    };
  }
}

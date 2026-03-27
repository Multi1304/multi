import { logger } from '../utils/logger';

export interface EvasionSignal {
  type: 'WAF' | 'REPUTATION' | 'BEHAVIOR';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  source: string;
}

export class EvasionService {
  /**
   * Analyzes an HTTP response or browser state for signs of detection.
   * In V2.5, this is a heuristic engine that "smells" bot detection.
   */
  static analyzeResponse(url: string, status: number, headers: Record<string, string>, body: string): EvasionSignal | null {
    // Detect Cloudflare / Akamai / Datadome patterns
    if (status === 403 || status === 429) {
      if (body.includes('cloudflare') || headers['server']?.toLowerCase().includes('cloudflare')) {
        return {
          type: 'WAF',
          severity: 'HIGH',
          description: 'Cloudflare challenge or block detected',
          source: url
        };
      }
      if (body.includes('datadome') || body.includes('dd-captcha')) {
        return {
          type: 'WAF',
          severity: 'CRITICAL',
          description: 'DataDome block detected',
          source: url
        };
      }
    }

    // Heuristic: uncommon status codes combined with specific headers
    if (status === 406 && headers['x-px-uuid']) {
      return {
        type: 'WAF',
        severity: 'HIGH',
        description: 'PerimeterX (HUMAN) block detected',
        source: url
      };
    }

    return null;
  }

  /**
   * Suggests an action based on detected signal.
   */
  static suggestMitigation(signal: EvasionSignal): 'ROTATE_PROXY' | 'CHANGE_FINGERPRINT' | 'PAUSE' | 'ABORT' {
    switch (signal.severity) {
      case 'CRITICAL': return 'ABORT';
      case 'HIGH': return 'ROTATE_PROXY';
      case 'MEDIUM': return 'CHANGE_FINGERPRINT';
      case 'LOW': return 'PAUSE';
      default: return 'PAUSE';
    }
  }

  /**
   * Generates a "stealth" path for sensitive operations.
   * Simulates human-like delays and jitter.
   */
  static getHumanJitter(baseDelay: number): number {
    return baseDelay + Math.floor(Math.random() * 500) - 250;
  }
}

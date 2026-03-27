import axios from 'axios';
import { logger } from '../utils/logger';
import { CaptchaRuntimePolicyService } from './captchaRuntimePolicy.service';

export class ThirdPartyCaptchaService {
  static isEnabled() {
    return CaptchaRuntimePolicyService.allowThirdPartyCaptcha();
  }

  static getHealthReport() {
    return {
      enabled: this.isEnabled(),
      hasApiKey: Boolean(process.env.CAPSOLVER_API_KEY),
    };
  }

  /**
   * Attempts to solve a PerimeterX / HUMAN Security challenge using Capsolver.
   * Returns the cookie string (e.g. `_px3=....`) or token if successful.
   * Returns null if unconfigured or failed.
   */
  static async solvePerimeterX(websiteURL: string, websiteKey: string): Promise<string | null> {
    if (!this.isEnabled()) {
      logger.info('[CAPTCHA-SOLVER-API] Third-party captcha provider disabled by runtime policy.');
      return null;
    }

    const apiKey = process.env.CAPSOLVER_API_KEY;
    if (!apiKey) {
      logger.info('[CAPTCHA-SOLVER-API] CAPSOLVER_API_KEY not found in environment. Skipping 3rd party logic.');
      return null;
    }

    try {
      logger.info('[CAPTCHA-SOLVER-API] Initiating Capsolver createTask for PerimeterX...', { websiteURL, websiteKey });

      // CapSolver API often uses AntiCyberSynergyTaskProxyless for PerimeterX / Human Security
      const createRes = await axios.post('https://api.capsolver.com/createTask', {
        clientKey: apiKey,
        task: {
          type: 'AntiCyberSynergyTaskProxyless',
          websiteURL,
          websiteKey
        }
      });

      if (createRes.data.errorId !== 0) {
        logger.error('[CAPTCHA-SOLVER-API] CapSolver createTask failed.', { error: createRes.data });
        return null;
      }

      const taskId = createRes.data.taskId;
      logger.info(`[CAPTCHA-SOLVER-API] Task created successfully. Task ID: ${taskId}. Waiting for resolution...`);

      // 2. Poll for the result
      let attempts = 0;
      const maxAttempts = 24; // 24 * 5s = 120s timeout
      
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000));
        attempts++;

        const pollRes = await axios.post('https://api.capsolver.com/getTaskResult', {
          clientKey: apiKey,
          taskId
        });

        if (pollRes.data.status === 'ready') {
          logger.info('[CAPTCHA-SOLVER-API] CapSolver task READY! Solution received.');
          
          const solution = pollRes.data.solution || {};
          // Solution might be inside `cookie`, `cookies`, or `token` depending on API version
          const pxCookie = solution.cookie || solution.cookies || solution.token; 
          return pxCookie as string;
        } else if (pollRes.data.status === 'failed') {
          logger.error('[CAPTCHA-SOLVER-API] CapSolver task FAILED.', { error: pollRes.data.errorDescription });
          return null;
        }

        logger.info(`[CAPTCHA-SOLVER-API] Task ${taskId} is ${pollRes.data.status}... (Attempt ${attempts}/${maxAttempts})`);
      }

      logger.warn('[CAPTCHA-SOLVER-API] CapSolver polling timed out.');
      return null;

    } catch (e: any) {
      logger.error('[CAPTCHA-SOLVER-API] Exception during API integration.', { error: e.message });
      return null;
    }
  }
}

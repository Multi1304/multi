import { logger } from '../utils/logger';
import axios from 'axios';

export class ApiNodeService {
  /**
   * Execute an API Request inside a hybrid flow (Fast protocol-level automation)
   */
  static async executeApiStep(step: any): Promise<{ status: 'completed' | 'failed'; output?: any; error?: string }> {
    const { type, config } = step;
    logger.debug('V3 RPA: Executing API step', { type, config });

    try {
      if (type !== 'api_request') throw new Error(`Unsupported API step type: ${type}`);
      if (!config?.url || !config?.method) throw new Error('URL and method are required for api_request');

      const response = await axios({
        method: config.method,
        url: config.url,
        data: config.body || undefined,
        headers: config.headers || {},
        timeout: config.timeout || 10000
      });

      logger.info(`API Step Completed: ${config.method} ${config.url}`);
      return { 
          status: 'completed', 
          output: { 
              status: response.status, 
              data: response.data 
          } 
      };

    } catch (error: any) {
      return { status: 'failed', error: error.message };
    }
  }
}

import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

export class OllamaService {
  static async chat(prompt: string, systemPrompt: string = 'You are a precise internal AI assistant.') {
    const baseUrl = config.ai.ollamaBaseUrl;
    const model = config.ai.ollamaModel;

    try {
      const response = await axios.post(
        `${baseUrl}/api/generate`,
        {
          model,
          prompt: `${systemPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON when JSON is requested.\n\n${prompt}`,
          stream: false,
          options: {
            temperature: 0.1,
          },
        },
        {
          timeout: 45000,
        }
      );

      return String(response.data?.response || '').trim();
    } catch (error: any) {
      logger.error('Ollama API Error', { error: error.response?.data || error.message });
      throw error;
    }
  }
}

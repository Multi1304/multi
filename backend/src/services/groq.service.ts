import axios from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config';

export class GroqService {
    public static get API_KEY() { 
        return config.ai.groqApiKey ? config.ai.groqApiKey.replace(/^"|"$/g, '').trim() : undefined; 
    }
    private static readonly BASE_URL = 'https://api.groq.com/openai/v1';

    /**
     * Universal chat interface for Groq (High Speed)
     */
    static async chat(prompt: string, systemPrompt: string = 'You are an RPA and Anti-Detect expert.') {
        if (!this.API_KEY) {
            logger.error('GROQ_API_KEY not configured');
            throw new Error('Groq API Key missing');
        }

        try {
            const response = await axios.post(
                `${this.BASE_URL}/chat/completions`,
                {
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: systemPrompt + ' IMPORTANT: Respond ONLY with a valid JSON object. Do not include markdown formatting or talk.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.1,
                    response_format: { type: 'json_object' },
                    stream: false
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data.choices[0].message.content;
        } catch (error: any) {
            logger.error('Groq API Error', { error: error.response?.data || error.message });
            throw error;
        }
    }

    /**
     * Generates a structural automation flow from a transcript
     */
    static async generateFlow(transcript: string) {
        const prompt = `Convert this automation goal into a JSON array of steps for CamelFarm V2.
    Supported types: navigate (url), click (selector), type (selector, text), wait (duration in ms), screenshot (no params).
    Goal: "${transcript}"`;

        return await this.chat(prompt, 'You are a precise RPA compiler.');
    }
}

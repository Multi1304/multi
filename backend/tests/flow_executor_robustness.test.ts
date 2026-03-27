import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowExecutorService } from '../src/services/flow.executor';
import { BrowserNodeService } from '../src/services/browser.node';
import axios from 'axios';
import { z } from 'zod';

vi.mock('axios');
vi.mock('../src/services/browser.node');
vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })
}));

describe('FlowExecutorService Robustness (Phase 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('substituteVariables with Zero-G Fuzzy Recovery', () => {
    it('should find variables case-insensitively (Fuzzy Match)', async () => {
      const variables = { firstName: 'Camel' };
      const template = 'Hello {{firstname}}';
      const result = await FlowExecutorService.substituteVariables(template, variables, 'test step');
      expect(result).toBe('Hello Camel');
    });

    it('should trigger AI Healing when variable is missing', async () => {
      const variables = { existing: 'value' };
      const template = 'Need {{missing_key}}';

      // Mock axios for healVariable
      (axios.post as any).mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: 'healed_value' } }]
        }
      });

      const result = await FlowExecutorService.substituteVariables(template, variables, 'test step');
      expect(result).toBe('Need healed_value');
      expect(variables).toHaveProperty('missing_key', 'healed_value');
    });
  });

  describe('executeStep with Retries', () => {
    it('should retry a failed browser step 3 times before giving up', async () => {
      const mockPage = {} as any;
      const step = { type: 'click', config: { selector: '#missing' } };

      (BrowserNodeService.executeBrowserStep as any)
        .mockRejectedValue(new Error('Selector not found'));

      const result = await FlowExecutorService.executeStep(step, mockPage, {});
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Selector not found');

      // Should be called 4 times total (1 initial + 3 retries)
      expect(BrowserNodeService.executeBrowserStep).toHaveBeenCalledTimes(4);
    });

    it('should succeed if a retry works', async () => {
      const mockPage = {} as any;
      const step = { type: 'click', config: { selector: '#flaky' } };

      (BrowserNodeService.executeBrowserStep as any)
        .mockRejectedValueOnce(new Error('Connection issue'))
        .mockResolvedValueOnce({ status: 'completed' });

      const result = await FlowExecutorService.executeStep(step, mockPage, {});
      expect(result.status).toBe('completed');
      expect(BrowserNodeService.executeBrowserStep).toHaveBeenCalledTimes(2);
    });
  });

  describe('Smart Prompt with Zod Guardrail', () => {
    it('should reject AI output containing IBAN/Bank data', async () => {
      const mockPage = {} as any;
      const step = { type: 'prompt', config: { prompt: 'Generate user identity' } };
      process.env.GROQ_API_KEY = 'test-key';

      // Mock Groq returning IBAN
      (axios.post as any).mockResolvedValue({
        data: {
          choices: [{ message: { content: JSON.stringify({ username: 'test', iban: 'ES123456789' }) } }]
        }
      });

      // It should retry 3 times and then fail if AI keeps sending IBAN
      const result = await FlowExecutorService.executeStep(step, mockPage, {});
      expect(result.status).toBe('failed');
      expect(result.error).toContain('leakage prevention');
    });

    it('should allow IBAN if explicitly requested in prompt', async () => {
      const mockPage = {} as any;
      const step = { type: 'prompt', config: { prompt: 'Generate user identity and include IBAN' } };
      process.env.GROQ_API_KEY = 'test-key';

      (axios.post as any).mockResolvedValue({
        data: {
          choices: [{ message: { content: JSON.stringify({ username: 'test', iban: 'ES123456789' }) } }]
        }
      });

      const result = await FlowExecutorService.executeStep(step, mockPage, {});
      expect(result.status).toBe('completed');
      expect(result.output).toHaveProperty('iban');
    });
  });
});

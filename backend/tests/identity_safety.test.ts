import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowExecutorService } from '../src/services/flow.executor';
import axios from 'axios';

vi.mock('axios');
vi.mock('../src/services/browser.node');
vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('FlowExecutorService Phase 3: Identity & Safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Adaptive Identity Healing', () => {
    it('should append @hotmail.com to username if missing in a Hotmail prompt', async () => {
      const mockPage = {} as any;
      const step = { type: 'prompt', config: { prompt: 'Generate hotmail identity' } };
      process.env.GROQ_API_KEY = 'test-key';

      (axios.post as any).mockResolvedValue({
        data: {
          choices: [{ message: { content: JSON.stringify({ username: 'karlos_maximo' }) } }]
        }
      });

      const result = await FlowExecutorService.executeStep(step, mockPage, {});
      expect(result.status).toBe('completed');
      expect(result.output.username).toBe('karlos_maximo@hotmail.com');
    });

    it('should append @outlook.com if the prompt specifically mentions outlook', async () => {
      const mockPage = {} as any;
      const step = { type: 'prompt', config: { prompt: 'Generate outlook identity' } };
      process.env.GROQ_API_KEY = 'test-key';

      (axios.post as any).mockResolvedValue({
        data: {
          choices: [{ message: { content: JSON.stringify({ username: 'karlos_maximo' }) } }]
        }
      });

      const result = await FlowExecutorService.executeStep(step, mockPage, {});
      expect(result.status).toBe('completed');
      expect(result.output.username).toBe('karlos_maximo@outlook.com');
    });

    it('should NOT append domain if it already has one', async () => {
        const mockPage = {} as any;
        const step = { type: 'prompt', config: { prompt: 'Generate hotmail identity' } };
        process.env.GROQ_API_KEY = 'test-key';
  
        (axios.post as any).mockResolvedValue({
          data: {
            choices: [{ message: { content: JSON.stringify({ username: 'existing@yahoo.com' }) } }]
          }
        });
  
        const result = await FlowExecutorService.executeStep(step, mockPage, {});
        expect(result.status).toBe('completed');
        expect(result.output.username).toBe('existing@yahoo.com');
      });
  });

  describe('Strict IBAN Prevention', () => {
    it('should throw "leakage prevention" error if AI generates IBAN unexpectedly', async () => {
      const mockPage = {} as any;
      const step = { type: 'prompt', config: { prompt: 'Generate identity' } };
      process.env.GROQ_API_KEY = 'test-key';

      (axios.post as any).mockResolvedValue({
        data: {
          choices: [{ message: { content: JSON.stringify({ username: 'test', iban: 'ES123456789' }) } }]
        }
      });

      const result = await FlowExecutorService.executeStep(step, mockPage, {});
      expect(result.status).toBe('failed');
      expect(result.error).toContain('leakage prevention');
    });
  });
});

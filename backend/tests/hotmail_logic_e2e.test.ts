import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowExecutorService } from '../src/services/flow.executor';
import { BrowserNodeService } from '../src/services/browser.node';
import axios from 'axios';

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

describe('Hotmail Flow Logic E2E (Phase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute a normalized Hotmail flow successfully', async () => {
    const mockPage = {} as any;
    const hotmailSteps = [
      { type: 'navigate', parameters: { url: 'signup.live.com' } }, // Test normalization of 'parameters'
      { type: 'wait', config: { ms: 2000 } }, // Test normalization of 'ms' -> 'duration'
      { type: 'prompt', config: { prompt: 'Generate username and password' } },
      { type: 'type', params: { selector: 'input[name="MemberName"]', text: '{{username}}' } }, // Test normalization of 'params' and variables
      { type: 'click', config: { target: 'input[type="submit"]' } }, // Test normalization of 'target' -> 'selector'
      { type: 'select_option', config: { css: '#BirthMonth', option: 'January' } } // Test normalization of 'select_option' -> 'select' and 'css' -> 'selector'
    ];

    // Mock AI response
    (axios.post as any).mockResolvedValue({
      data: {
        choices: [{ message: { content: JSON.stringify({ username: 'camel_test_123' }) } }]
      }
    });

    // Mock Browser Service responses
    (BrowserNodeService.executeBrowserStep as any).mockResolvedValue({ status: 'completed' });

    const sharedVars = {};
    for (const step of hotmailSteps) {
      const result = await FlowExecutorService.executeStep(step, mockPage, sharedVars);
      expect(result.status).toBe('completed');
      if (result.output) Object.assign(sharedVars, result.output);
    }

    console.log('EXECUTE-STEP-CALLS:', JSON.stringify((BrowserNodeService.executeBrowserStep as any).mock.calls, null, 2));

    // Verify normalization
    expect(BrowserNodeService.executeBrowserStep).toHaveBeenCalledWith(mockPage, expect.objectContaining({ type: 'navigate' }));

    const calls = (BrowserNodeService.executeBrowserStep as any).mock.calls;
    expect(calls[1][1].type).toBe('wait');
    expect(calls[2][1].type).toBe('type');
    expect(calls[2][1].config.text).toBe('camel_test_123');

    // 4. Click
    expect(calls[3][1].type).toBe('click');

    // 5. Select
    expect(calls[4][1].type).toBe('select');
    expect(calls[4][1].config.value).toBe('January');
  });
});

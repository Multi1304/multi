import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowExecutorService } from '../src/services/flow.executor';
import { BrowserNodeService } from '../src/services/browser.node';

vi.mock('../src/services/browser.node');
vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('FlowExecutorService Phase 5: Conditionals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute true branch if element exists', async () => {
    const mockPage = {
      waitForSelector: vi.fn().mockResolvedValue(true)
    } as any;

    const step = {
      type: 'conditional',
      config: {
        condition: 'if #captcha exists',
        trueSteps: [{ type: 'wait', config: { ms: 100 } }]
      }
    };

    (BrowserNodeService.executeBrowserStep as any).mockResolvedValue({ status: 'completed' });

    const result = await FlowExecutorService.executeStep(step, mockPage, {});
    
    expect(result.status).toBe('completed');
    expect(result.output.branchExecuted).toBe('true');
    expect(mockPage.waitForSelector).toHaveBeenCalledWith('#captcha', expect.objectContaining({ timeout: 8000 }));
    expect(BrowserNodeService.executeBrowserStep).toHaveBeenCalled();
  });

  it('should execute else branch if element missing', async () => {
    const mockPage = {
      waitForSelector: vi.fn().mockRejectedValue(new Error('Timeout'))
    } as any;

    const step = {
      type: 'conditional',
      config: {
        condition: 'if #captcha exists',
        trueSteps: [{ type: 'click', config: { selector: '#solve' } }],
        elseSteps: [{ type: 'wait', config: { ms: 50 } }]
      }
    };

    (BrowserNodeService.executeBrowserStep as any).mockResolvedValue({ status: 'completed' });

    const result = await FlowExecutorService.executeStep(step, mockPage, {});
    
    expect(result.status).toBe('completed');
    expect(result.output.branchExecuted).toBe('false');
    expect(BrowserNodeService.executeBrowserStep).toHaveBeenCalled();
  });
});

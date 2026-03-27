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

describe('FlowExecutorService Phase 4: Logging & Diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should capture diagnostic screenshot on failure', async () => {
    const mockPage = {} as any;
    const step = { id: 'fail_step', type: 'click', config: { selector: '#missing' } };

    // Mock failure
    (BrowserNodeService.executeBrowserStep as any).mockResolvedValue({
      status: 'failed',
      error: 'Selector not found'
    });

    // Mock diagnostic
    (BrowserNodeService.captureDiagnostic as any).mockResolvedValue('data:image/png;base64,dummy');

    const result = await FlowExecutorService.executeStep(step, mockPage, {});
    
    expect(result.status).toBe('failed');
    expect(result.diagnostic).toBe('data:image/png;base64,dummy');
    expect(BrowserNodeService.captureDiagnostic).toHaveBeenCalledWith(mockPage, 'fail_step');
  });

  it('should handle diagnostic capture failure gracefully', async () => {
    const mockPage = {} as any;
    const step = { id: 'fail_step_2', type: 'click', config: { selector: '#missing' } };

    (BrowserNodeService.executeBrowserStep as any).mockResolvedValue({
      status: 'failed',
      error: 'Timeout'
    });

    (BrowserNodeService.captureDiagnostic as any).mockRejectedValue(new Error('Screenshot failed'));

    const result = await FlowExecutorService.executeStep(step, mockPage, {});
    
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Timeout');
    // Result might be undefined if it threw and was caught in captureDiagnostic internal try-catch
    // but in executeStep it's awaited.
  });
});

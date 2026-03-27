import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserNodeService } from '../src/services/browser.node';

// Mock logger
vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('BrowserNodeService: Semantic Resolution & Anti-Stasis', () => {
  let mockPage: any;

  beforeEach(() => {
    mockPage = {
      isVisible: vi.fn(),
      locator: vi.fn(),
      url: vi.fn().mockReturnValue('https://signup.live.com/signup'),
      waitForTimeout: vi.fn().mockResolvedValue(true),
      viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
      mouse: {
        move: vi.fn().mockResolvedValue(true),
        click: vi.fn().mockResolvedValue(true)
      },
      evaluate: vi.fn(),
      keyboard: {
        press: vi.fn().mockResolvedValue(true)
      },
      screenshot: vi.fn().mockResolvedValue(Buffer.from('test'))
    };
  });

  it('should resolve "BirthMonth" semantically using Spanish tokens', async () => {
    const primarySelector = '#BirthMonth';

    mockPage.isVisible.mockImplementation(async (selector: string) => selector === '#semantic-id123');
    mockPage.locator.mockReturnValue({ first: () => ({ count: () => Promise.resolve(0) }) });
    mockPage.evaluate.mockResolvedValueOnce('#semantic-id123');

    const result = await (BrowserNodeService as any).waitForWaterfall(mockPage, 'wait', primarySelector, 5000);

    expect(result.selector).toBe('#semantic-id123');
  });

  it('should NOT trigger KINETIC-STRIKE for date-related fields', async () => {
    const primarySelector = '#BirthMonth'; // contains "birth"

    mockPage.isVisible.mockResolvedValue(false);
    mockPage.locator.mockReturnValue({ first: () => ({ count: () => Promise.resolve(0) }) });

    const start = Date.now();
    vi.spyOn(Date, 'now').mockReturnValueOnce(start) // startTime
                      .mockReturnValueOnce(start) // lastJiggle
                      .mockReturnValueOnce(start + 31000)
                      .mockReturnValue(start + 31000);

    const spy = vi.spyOn(BrowserNodeService as any, 'hyperKineticClick');

    try {
        await (BrowserNodeService as any).waitForWaterfall(mockPage, 'wait', primarySelector, 2000);
    } catch (e) {
        // Expected timeout
    }

    expect(spy).not.toHaveBeenCalled();
  });
});

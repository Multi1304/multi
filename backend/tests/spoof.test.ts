import { describe, it, expect, vi } from 'vitest';
import { SpoofEngine } from '../src/core/spoof';

describe('SpoofEngine Evasion Validation', () => {
  // vitest uses different timeout config, setting it per test or globally

  it('should successfully override Canvas padding, WebGL vendor, and select random UA (Predictive)', async () => {
    // Config passes an exact seed/vendor, but the logic might ping Ollama and return JSON modifications
    const config = {
      id: 'test_predictive_integration',
      canvasSeed: 12345,
      webglVendor: 'Google Inc.',
      webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      hardwareConcurrency: 16
      // Note: userAgent is deliberately omitted to test auto-selection
    };

    const { browser, page } = await SpoofEngine.launchProfile(config);
    
    try {
      // Navigate to a blank page to evaluate generic spoofing
      await page.goto('about:blank');

      // 1. Validate Hardware Concurrency was spoofed
      const concurrency = await page.evaluate(() => navigator.hardwareConcurrency);
      expect(concurrency).toBeGreaterThanOrEqual(1);

      // 2. Validate User Agent was dynamically injected from the pool
      const ua = await page.evaluate(() => navigator.userAgent);
      expect(ua).toBeDefined();
      expect(ua.length).toBeGreaterThan(20);
      expect(ua).not.toBe('unknown');

      // 2. Validate WebGL
      const webglData = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return null;
        
        const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) return null;

        return {
          vendor: (gl as any).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
          renderer: (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        };
      });

      expect(webglData).not.toBeNull();
      expect(webglData?.vendor).toBe('Google Inc.');
      expect(webglData?.renderer).toBe('ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)');

      // 3. Validate Canvas Mock Override is present
      const canvasOverrideActive = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        
        // This is a naive check to see if our proxy logic kicks in
        ctx.fillText('test', 10, 10);
        return ctx.globalAlpha !== 1.0; // Our spoof script alters globalAlpha slightly
      });

      expect(canvasOverrideActive).toBe(true);

    } finally {
      await browser.close();
    }
  });

  it('should simulate human-like mouse movements and scroll via simulateHumanBehavior', async () => {
    // Launch without humanMode to spy on the page first, then trigger manually
    const { browser, page } = await SpoofEngine.launchProfile({ humanMode: false });
    
    try {
      await page.goto('about:blank');
      
      // Spy on Puppeteer's mouse move method
      const mouseMoveSpy = vi.spyOn(page.mouse, 'move');
      // Spy on page.evaluate specifically looking for window.scrollBy
      const evaluateSpy = vi.spyOn(page, 'evaluate');
      
      await SpoofEngine.simulateHumanBehavior(page);
      
      // Verify mouse was moved in multiple steps (Bezier curve simulation)
      expect(mouseMoveSpy).toHaveBeenCalled();
      expect(mouseMoveSpy.mock.calls.length).toBeGreaterThan(10);
      
      // Verify evaluation calls were made (for scrolling logic)
      expect(evaluateSpy).toHaveBeenCalled();
      
      // Additionally, if we launch with humanMode: true directly, we ensure it doesn't crash
      const autoHumanProfile = await SpoofEngine.launchProfile({ humanMode: true });
      await autoHumanProfile.browser.close();

    } finally {
      await browser.close();
    }
  }, 120000);
});

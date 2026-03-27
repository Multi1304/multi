import { Router } from 'express';
import { XaiService } from '../services/xai.service';
import { XSearchService } from '../services/xSearch.service';
import { logger } from '../utils/logger';
import { SandboxAiAdvisorService } from '../services/sandboxAiAdvisor.service';
import { IntentFlowSandboxService } from '../services/intentFlowSandbox.service';
import { requireRole } from '../middleware/auth';

const router = Router();

/**
 * @route POST /api/ai/chat
 * @desc Chat with Grok for profile optimization advice
 */
router.post('/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const result = await XaiService.chat(prompt);
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ error: 'AI Assistant currently unavailable' });
  }
});

/**
 * @route POST /api/ai/ban-trends
 * @desc Get live ban trends for a platform via Grok X-Search
 */
router.post('/ban-trends', async (req, res) => {
  try {
    const { platform } = req.body;
    if (!platform) return res.status(400).json({ error: 'Platform is required' });

    const trends = await XSearchService.analyzePlatformTrends(platform);
    res.json({ success: true, trends });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch live trends' });
  }
});

/**
 * @route POST /api/ai/create-profile-semantic
 * @desc Generate a full profile JSON from a natural language description
 */
router.post('/create-profile-semantic', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const prompt = `Create a complete, enterprise-grade stealth browser profile JSON based on this requirement: "${query}".
    Include: name, userAgent, screenRes (array [w,h]), canvasSeed, hardwareConcurrency, webglVendor, webglRenderer.
    Make it optimized to avoid bans on major platforms.`;

    const resultText = await XaiService.chat(prompt, 'You are an RPA and Anti-Detect expert. Return ONLY JSON.');
    const profile = JSON.parse(resultText);

    res.json({ success: true, profile });
  } catch (error: any) {
    logger.error('Semantic Profile Creation Failed', { error: error.message });
    res.status(500).json({ error: 'Failed to generate profile semantically' });
  }
});

/**
 * @route POST /api/ai/sandbox-advisor
 * @desc Analyze internal sandbox automation telemetry and return safe recommendations only
 */
router.post('/sandbox-advisor', async (req, res) => {
  try {
    const result = await SandboxAiAdvisorService.advise(req.body || {}, (req as any).user?.tenantId);
    res.json({ success: true, result });
  } catch (error: any) {
    logger.error('Sandbox advisor failed', { error: error.message });
    res.status(500).json({ error: 'Sandbox advisor unavailable' });
  }
});

router.post('/intent-flow-sandbox', requireRole('ADMIN', 'MANAGER'), async (req: any, res) => {
  try {
    const { prompt, targetHost } = req.body || {};
    if (!prompt || !targetHost) return res.status(400).json({ error: 'prompt and targetHost are required' });
    const result = await IntentFlowSandboxService.generate(req.user.tenantId, prompt, targetHost);
    res.json({ success: true, result });
  } catch (error: any) {
    logger.error('Sandbox intent flow generation failed', { error: error.message });
    res.status(400).json({ error: error?.message || 'Failed to generate sandbox flow' });
  }
});

export default router;

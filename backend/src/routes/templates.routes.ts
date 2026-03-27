import { Router } from 'express';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

const router = Router();
const TEMPLATES_DIR = path.join(__dirname, '../utils/templates');

// List all platforms available
router.get('/list', async (req, res) => {
    try {
        const files = await fs.readdir(TEMPLATES_DIR);
        const platforms = files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));

        res.json(platforms);
    } catch (error: any) {
        logger.error('Failed to list templates', { error: error.message });
        res.status(500).json({ error: 'Failed to retrieve template list' });
    }
});

// Get specific template by platform
router.get('/:platform', async (req, res) => {
    const { platform } = req.params;
    try {
        const filePath = path.join(TEMPLATES_DIR, `${platform}.json`);
        const content = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(content));
    } catch (error: any) {
        logger.error(`Template not found: ${platform}`, { error: error.message });
        res.status(404).json({ error: `Template for ${platform} not found` });
    }
});

// Save custom template to DB
router.post('/custom', async (req, res) => {
    const { name, config, platform } = req.body;
    const user = (req as any).user;

    try {
        const { prisma } = await import('../prisma');
        const preset = await prisma.fingerprintPreset.create({
            data: {
                name,
                tenantId: user.tenantId,
                config: config as any,
                platform: platform || 'WINDOWS'
            }
        });

        logger.info('Custom template saved', { id: preset.id, userId: user.userId });
        res.json({ success: true, preset });
    } catch (error: any) {
        logger.error('Failed to save custom template', { error: error.message });
        res.status(500).json({ error: 'Failed to save template' });
    }
});

export default router;

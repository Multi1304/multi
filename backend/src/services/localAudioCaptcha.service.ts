import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

export class LocalAudioCaptchaService {
  private static isBridgeEnabled = true;

  public static isEnabled() {
    return this.isBridgeEnabled;
  }

  public static async transcribeAudio(audioPath: string): Promise<string | null> {
    if (!this.isBridgeEnabled) return null;

    // Use exact path matching strategy similar to localVisionCaptcha.service
    const rootDir = process.cwd();
    let scriptPath = path.resolve(rootDir, 'ai_modules', 'audio_solver.py');
    
    if (!fs.existsSync(scriptPath)) {
      scriptPath = path.resolve(rootDir, '..', 'ai_modules', 'audio_solver.py');
    }

    if (!fs.existsSync(scriptPath)) {
      logger.warn('[AUDIO-SOLVER] audio_solver.py not found in typical directories.', { triedPaths: [scriptPath] });
      return null;
    }

    if (!fs.existsSync(audioPath)) {
        logger.warn('[AUDIO-SOLVER] Target audio file not found on disk:', { audioPath });
        return null;
    }

    return new Promise((resolve, reject) => {
      logger.info(`[AUDIO-SOLVER] Calling python bridge for STT inference on ${audioPath}`);
      
      const process = spawn('python', [scriptPath, audioPath]);
      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.on('close', (code) => {
        try {
          const parsed = JSON.parse(output.trim());
          if (parsed.success) {
            // Arkose audio responses are strings of numbers (e.g., "14258" or "1 4 2 5 8")
            // We strip spaces and alphabetic artifacts
            const rawText = parsed.text;
            let digitsOnly = String(rawText).replace(/\D/g, '');
            
            // Sometimes it spells "one four two" etc. 
            // If digits alone are empty, we can just return the raw text to let Playwright type it.
            // Usually, numeric strings are requested by Arkose.
            const result = digitsOnly.length > 0 ? digitsOnly : rawText.trim();
            
            logger.info('[AUDIO-SOLVER] Successfully decoded audio challenge:', { rawText, result });
            resolve(result);
          } else {
            logger.warn('[AUDIO-SOLVER] Bridge returned error.', { error: parsed.error, trace: parsed.trace });
            resolve(null);
          }
        } catch (e) {
          logger.warn('[AUDIO-SOLVER] Failed to parse output from python bridge.', { output: output.slice(0, 500), errorOutput, e: (e as Error).message });
          resolve(null);
        }
      });
    });
  }
}

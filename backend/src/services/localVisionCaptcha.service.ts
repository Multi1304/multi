import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { logger } from '../utils/logger';
import { CaptchaRuntimePolicyService } from './captchaRuntimePolicy.service';

export interface LocalVisionDetection {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
}

interface LocalVisionBridgeResult {
  success: boolean;
  detections?: LocalVisionDetection[];
  error?: string;
}

export class LocalVisionCaptchaService {
  private static readonly DEFAULT_MODEL_PATH = path.resolve(process.cwd(), 'ai_models', 'yolov8n.pt');
  private static readonly DEFAULT_SCRIPT_PATH = path.resolve(process.cwd(), 'ai_modules', 'yolo_bridge.py');
  private static readonly DEFAULT_TARGET_LABELS = ['press_hold', 'captcha', 'button', 'checkbox'];

  private static getModelPath() {
    const envPath = process.env.YOLO_MODEL_PATH;
    if (envPath && fs.existsSync(envPath)) return envPath;
    
    // Prioritize the location where I just copied the model
    const possiblePaths = [
      path.resolve(process.cwd(), 'yolov8n.pt'),
      path.resolve(__dirname, '..', '..', 'yolov8n.pt'),
      path.join('C:\\Users\\xazai\\Downloads\\multilogin-platform\\backend', 'yolov8n.pt'),
      'C:\\Users\\xazai\\multilogin-platform\\backend\\yolov8n.pt',
      this.DEFAULT_MODEL_PATH
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }
    return this.DEFAULT_MODEL_PATH;
  }

  private static getScriptPath() {
    const envPath = process.env.YOLO_BRIDGE_SCRIPT;
    if (envPath && fs.existsSync(envPath)) return envPath;

    const possiblePaths = [
      this.DEFAULT_SCRIPT_PATH,
      path.resolve(process.cwd(), 'ai_modules', 'yolo_bridge.py'),
      path.resolve(__dirname, '..', '..', 'ai_modules', 'yolo_bridge.py'),
      'C:\\Users\\xazai\\Downloads\\multilogin-platform\\backend\\ai_modules\\yolo_bridge.py'
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }
    return this.DEFAULT_SCRIPT_PATH;
  }

  private static getPythonBin() {
    return process.env.PYTHON_BIN || 'python';
  }

  private static getTargetLabels() {
    const raw = String(process.env.YOLO_TARGET_LABELS || '').trim();
    if (!raw) return this.DEFAULT_TARGET_LABELS;
    return raw
      .split(',')
      .map((label) => label.trim().toLowerCase())
      .filter(Boolean);
  }

  static isEnabled() {
    return CaptchaRuntimePolicyService.allowLocalVisionBridge();
  }

  static getHealthReport() {
    const scriptPath = this.getScriptPath();
    const modelPath = this.getModelPath();

    return {
      enabled: this.isEnabled(),
      pythonBin: this.getPythonBin(),
      scriptPath,
      scriptExists: fs.existsSync(scriptPath),
      modelPath,
      modelExists: fs.existsSync(modelPath),
      targetLabels: this.getTargetLabels(),
    };
  }

  static async detectPrimaryTarget(imagePath: string): Promise<LocalVisionDetection | null> {
    const bridgeResult = await this.analyzeImage(imagePath);
    if (!bridgeResult?.success || !Array.isArray(bridgeResult.detections) || bridgeResult.detections.length === 0) {
      return null;
    }

    const preferredLabels = this.getTargetLabels();
    const sortedDetections = [...bridgeResult.detections].sort((left, right) => right.confidence - left.confidence);
    const preferredDetection = sortedDetections.find((item) => preferredLabels.includes(String(item.label || '').toLowerCase()));
    return preferredDetection || sortedDetections[0] || null;
  }

  static async analyzeImage(imagePath: string): Promise<LocalVisionBridgeResult | null> {
    if (!this.isEnabled()) {
      logger.info('[YOLO-CAPTCHA] Local vision bridge disabled by runtime policy.');
      return null;
    }

    const scriptPath = this.getScriptPath();
    const modelPath = this.getModelPath();

    logger.info('[YOLO-BRIDGE-DEBUG] Vision bridge attempt:', { 
        scriptPath, 
        modelPath, 
        scriptExists: fs.existsSync(scriptPath),
        modelExists: fs.existsSync(modelPath) 
    });

    if (!fs.existsSync(scriptPath)) {
      logger.warn('[YOLO-CAPTCHA] Bridge script not found.', { scriptPath });
      return null;
    }

    if (!fs.existsSync(modelPath)) {
      logger.warn('[YOLO-CAPTCHA] Model file not found.', { modelPath });
      return null;
    }

    return new Promise((resolve) => {
      const child = spawn(this.getPythonBin(), [scriptPath, imagePath, modelPath], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        logger.warn('[YOLO-CAPTCHA] Failed to spawn local bridge.', { error: error.message });
        resolve(null);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          logger.warn('[YOLO-CAPTCHA] Bridge exited with non-zero code.', {
            code,
            stderr: stderr.slice(0, 500),
          });
          resolve(null);
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim() || '{}');
          resolve(parsed);
        } catch (error: any) {
          logger.warn('[YOLO-CAPTCHA] Invalid bridge JSON.', {
            error: error?.message,
            stdout: stdout.slice(0, 500),
            stderr: stderr.slice(0, 500),
          });
          resolve(null);
        }
      });
    });
  }
}

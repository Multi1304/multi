import { spawn } from 'child_process';
import path from 'path';
import { logger } from '../utils/logger';

export interface Detection {
  box: { x1: number; y1: number; x2: number; y2: number };
  class: string;
  confidence: number;
}

export class VisionSolverService {
  private static pythonPath = process.env.PYTHON_PATH || 'python';
  private static scriptPath = path.join(__dirname, '../../ai_modules/vision_solver.py');

  /**
   * Runs YOLO object detection on a given image file.
   * Returns a list of detections with bounding boxes and classes.
   */
  static async detectObjects(imagePath: string): Promise<Detection[]> {
    return new Promise((resolve, reject) => {
      logger.info(`[VISION-SOLVER] Running YOLO detection on: ${imagePath}`);
      
      const absImagePath = path.resolve(imagePath);
      const pythonProcess = spawn(this.pythonPath, [this.scriptPath, absImagePath]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          logger.error(`[VISION-SOLVER] YOLO process exited with code ${code}`, { stderr });
          return resolve([]);
        }

        try {
          const result = JSON.parse(stdout);
          if (result.success) {
            logger.info(`[VISION-SOLVER] Detection successful. Found ${result.detections.length} objects.`);
            return resolve(result.detections);
          } else {
            logger.error(`[VISION-SOLVER] YOLO detection failed inside script.`, { error: result.error });
            return resolve([]);
          }
        } catch (e: any) {
          logger.error(`[VISION-SOLVER] Failed to parse YOLO output.`, { error: e.message, stdout });
          return resolve([]);
        }
      });
    });
  }
}

import { spawn } from 'child_process';
import path from 'path';
import { logger } from '../utils/logger';

export class OllamaService {
  private static readonly OLLAMA_EXE = 'C:\\Users\\xazai\\tools\\Ollama\\ollama.exe';
  private static readonly AGENT_PATH = path.join(process.cwd(), 'ai_modules', 'adk_agent.py');
  private static readonly PYTHON_CMD = 'python';

  /**
   * Checks if Ollama server is running and model is loaded.
   */
  static async checkHealth() {
    return new Promise<boolean>((resolve) => {
      const proc = spawn(this.OLLAMA_EXE, ['list']);
      let stdout = '';
      proc.stdout.on('data', (data) => stdout += data.toString());
      proc.on('close', (code) => {
        resolve(code === 0 && stdout.toLowerCase().includes('qwen2.5:7b'));
      });
      proc.on('error', () => resolve(false));
    });
  }

  /**
   * Calls the Python ADK Agent for specialized tasks.
   */
  static async runAdkTask(taskType: string, payload: string) {
    logger.info('Calling Python ADK Agent via Spawn', { taskType });
    const startTime = Date.now();

    return new Promise<any>((resolve) => {
      // Using spawn is safer than exec for Windows quoting
      const proc = spawn(this.PYTHON_CMD, [this.AGENT_PATH, taskType, payload]);
      
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => stdout += data.toString());
      proc.stderr.on('data', (data) => stderr += data.toString());

      proc.on('close', (code) => {
        if (stderr) logger.debug('ADK Agent stderr', { stderr });
        
        if (code !== 0) {
          logger.error('ADK Agent exited with code', { code, stderr });
          return resolve({ success: false, error: 'AI Agent Process Failure' });
        }

        try {
          if (!stdout) throw new Error('No stdout from agent');
          const duration = Date.now() - startTime;
          const parsedExport = JSON.parse(stdout);
          logger.info('ADK Task Completed', { taskType, duration, success: parsedExport.success });
          resolve(parsedExport);
        } catch (error: any) {
          logger.error('Failed to parse AI output', { stdout, error: error.message });
          resolve({ success: false, error: 'AI Output Parsing Failure' });
        }
      });

      proc.on('error', (err) => {
        logger.error('Failed to start AI Agent', { error: err.message });
        resolve({ success: false, error: 'AI Agent Startup Failure' });
      });
    });
  }
}

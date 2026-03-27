import { logger } from '../utils/logger';
import * as os from 'os';

export type CpuArch = 'x64' | 'arm64' | 'ia32' | 'unknown';

export class ArchService {
  /**
   * Detects the current system architecture.
   */
  static getSystemArch(): CpuArch {
    const arch = os.arch();
    logger.debug('Detecting system architecture', { arch });
    
    if (arch === 'x64' || arch === 'arm64' || arch === 'ia32') {
      return arch as CpuArch;
    }
    
    return 'unknown';
  }

  /**
   * Checks if a target fingerprint is compatible with the current architecture.
   * For extreme evasion, matching the real architecture is preferred.
   */
  static isCompatible(targetArch: string): boolean {
    const current = this.getSystemArch();
    if (current === 'arm64' && targetArch.toLowerCase().includes('arm')) return true;
    if (current === 'x64' && targetArch.toLowerCase().includes('x64')) return true;
    return false;
  }
}

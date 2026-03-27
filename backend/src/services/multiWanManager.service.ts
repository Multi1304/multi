import * as os from 'os';
import { execSync } from 'child_process';
import { logger } from '../utils/logger';

export interface NetworkInterfaceInfo {
  name: string;
  description: string;
  status: string;
  ipAddress: string | null;
  isWanCandidate: boolean;
}

export class MultiWanManagerService {
  /**
   * Lists all physical network interfaces available on the Windows host.
   * Filters for active interfaces that could be used as egress points.
   */
  static async listPhysicalInterfaces(): Promise<NetworkInterfaceInfo[]> {
    try {
      if (process.platform !== 'win32') {
        return this.listGenericInterfaces();
      }

      const stdout = execSync(
        'powershell -Command "Get-NetAdapter | Where-Object Status -eq \'Up\' | Select-Object Name, InterfaceDescription, Status | ConvertTo-Json"',
        { encoding: 'utf8' }
      );

      const adapters = JSON.parse(stdout);
      const adapterList = Array.isArray(adapters) ? adapters : [adapters];

      const ipInfoStdout = execSync(
        'powershell -Command "Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, IPAddress | ConvertTo-Json"',
        { encoding: 'utf8' }
      );
      const ipAddresses = JSON.parse(ipInfoStdout);
      const ipList = Array.isArray(ipAddresses) ? ipAddresses : [ipAddresses];

      return adapterList.map((adapter: any) => {
        const ipMatch = ipList.find((ip: any) => ip.InterfaceAlias === adapter.Name);
        return {
          name: adapter.Name,
          description: adapter.InterfaceDescription,
          status: adapter.Status,
          ipAddress: ipMatch?.IPAddress || null,
          isWanCandidate: !adapter.InterfaceDescription.toLowerCase().includes('virtual') && 
                          !adapter.InterfaceDescription.toLowerCase().includes('pseudo') &&
                          !adapter.Name.toLowerCase().includes('vbox') &&
                          !adapter.Name.toLowerCase().includes('wsl'),
        };
      });
    } catch (error) {
      logger.error('Failed to list physical interfaces', { error });
      return this.listGenericInterfaces();
    }
  }

  private static listGenericInterfaces(): NetworkInterfaceInfo[] {
    const interfaces = os.networkInterfaces();
    const result: NetworkInterfaceInfo[] = [];

    for (const [name, info] of Object.entries(interfaces)) {
      if (!info) continue;
      const ipv4 = (info as any[]).find(i => i.family === 'IPv4' && !i.internal);
      if (ipv4) {
        result.push({
          name,
          description: 'Generic Interface',
          status: 'Up',
          ipAddress: ipv4.address,
          isWanCandidate: !name.toLowerCase().includes('lo') && !name.toLowerCase().includes('vbox'),
        });
      }
    }
    return result;
  }

  /**
   * Generates a binding map for the 4 standard Camel lanes based on available WAN candidates.
   */
  static async suggestLaneBinding() {
    const candidates = (await this.listPhysicalInterfaces()).filter(i => i.isWanCandidate);
    
    // If only one WAN, we share it (current state).
    // If multiple, we spread them.
    return {
      stable_internal: candidates[0]?.name || 'default',
      geo_sensitive: candidates[1]?.name || candidates[0]?.name || 'default',
      overflow_backup: candidates[2]?.name || candidates[0]?.name || 'default',
      high_separation: candidates[3]?.name || candidates[1]?.name || candidates[0]?.name || 'default',
      availableCount: candidates.length,
    };
  }
}

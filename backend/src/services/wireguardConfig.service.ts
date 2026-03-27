import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { SelfHostedVpnBootstrapService } from './selfHostedVpnBootstrap.service';

export class WireguardConfigService {
  private static CONFIG_DIR = path.resolve(process.cwd(), 'configs', 'wireguard');

  /**
   * Scans the config directory for .conf files and registers them in Camel.
   * This allows the user to simply DROP a Wireguard config to add a private exit.
   */
  static async syncConfigs(tenantId: string) {
    if (!fs.existsSync(this.CONFIG_DIR)) {
      return { summary: 'Wireguard config directory not found.', count: 0 };
    }

    const files = fs.readdirSync(this.CONFIG_DIR).filter(f => f.endsWith('.conf'));
    
    const exits = files.map(file => {
      const name = path.basename(file, '.conf');
      // In a real scenario, we would parse the .conf to find the 'Address' or 'Endpoint'
      // For this orchestration, we assume each .conf maps to a local proxy at 1081, 1082, etc.
      // or we expect the user to have provided mapping metadata.
      return {
        name,
        host: 'localhost', // The local endpoint that tunnels via this .conf
        port: 1080 + files.indexOf(file) + 1, 
        group: 'high_separation', // Default group for custom private exits
        cluster: `wg-custom-${name}`,
        provider: 'PRIVATE_WIREGUARD',
      };
    });

    if (exits.length === 0) {
      return { summary: 'No Wireguard config files found to sync.', count: 0 };
    }

    const result = await SelfHostedVpnBootstrapService.registerExits(tenantId, exits as any);
    return {
      summary: `Synced ${exits.length} Wireguard configurations. ${result.summary}`,
      count: exits.length,
    };
  }
}

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { logger } from '../utils/logger';
import { SelfHostedVpnBootstrapService } from './selfHostedVpnBootstrap.service';

export interface ProvisioningOptions {
  host: string;
  user: string;
  sshKeyPath?: string;
  password?: string;
  group?: string;
}

export class VpsProvisioningService {
  private static BOOTSTRAP_SCRIPT_PATH = path.resolve(process.cwd(), 'scripts', 'vps', 'bootstrap-node.sh');

  /**
   * Deploys the Camel Exit Node bootstrap to a remote VPS.
   */
  static async provision(tenantId: string, options: ProvisioningOptions) {
    logger.info('Starting VPS provisioning for private VPN exit', { host: options.host });

    if (!fs.existsSync(this.BOOTSTRAP_SCRIPT_PATH)) {
      throw new Error('Bootstrap script not found at ' + this.BOOTSTRAP_SCRIPT_PATH);
    }

    const scriptContent = fs.readFileSync(this.BOOTSTRAP_SCRIPT_PATH, 'utf8');

    try {
      // 1. Upload the script
      logger.info('Uploading bootstrap script to ' + options.host);
      const remotePath = '/tmp/camel-bootstrap.sh';
      this.runSsh(options, `cat << 'EOF' > ${remotePath}\n${scriptContent}\nEOF`);

      // 2. Execute the script
      logger.info('Executing bootstrap script on ' + options.host);
      const stdout = this.runSsh(options, `chmod +x ${remotePath} && sudo ${remotePath}`);

      // 3. Parse output to find Public Key
      const pubKeyMatch = stdout.match(/Public Key: (.*)/);
      const pubKey = pubKeyMatch ? pubKeyMatch[1].trim() : null;

      if (!pubKey) {
        throw new Error('Failed to retrieve Wireguard Public Key from VPS bootstrap output.');
      }

      // 4. Register in Camel
      const exitData = {
        name: `pvt-exit-${options.host.replace(/\./g, '-')}`,
        host: options.host,
        port: 8888, // Tinyproxy port from bootstrap
        group: options.group || 'high_separation',
        provider: 'PRIVATE_SELF_HOSTED',
        metadata: {
          provisionedAt: new Date().toISOString(),
          wireguardPubKey: pubKey,
          os: 'ubuntu-bootstrap',
        }
      };

      await SelfHostedVpnBootstrapService.registerExits(tenantId, [exitData as any]);

      return {
        success: true,
        summary: `Successfully provisioned private VPN exit on ${options.host}.`,
        pubKey,
      };

    } catch (error: any) {
      logger.error('VPS Provisioning failed', { host: options.host, error: error.message });
      throw error;
    }
  }

  private static runSsh(options: ProvisioningOptions, command: string): string {
    const sshCmd = this.buildSshCommand(options, command);
    return execSync(sshCmd, { encoding: 'utf8' });
  }

  private static buildSshCommand(options: ProvisioningOptions, command: string): string {
    const keyPart = options.sshKeyPath ? `-i "${options.sshKeyPath}"` : '';
    const authPart = `${options.user}@${options.host}`;
    
    // Windows SSH client might need extra quotes or escaping
    return `ssh -o StrictHostKeyChecking=no ${keyPart} ${authPart} "${command.replace(/"/g, '\\"')}"`;
  }
}

import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { SecurityPostureService } from './securityPosture.service';
import { SecurityPolicyService } from './securityPolicy.service';

type ReadinessCheckStatus = 'pass' | 'warn' | 'fail';

type ReadinessCheck = {
  key: string;
  title: string;
  status: ReadinessCheckStatus;
  detail: string;
};

async function fileExists(candidate: string) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function readFileIfExists(candidate: string) {
  try {
    return await fs.readFile(candidate, 'utf8');
  } catch {
    return '';
  }
}

function repoRootCandidates() {
  return [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
  ];
}

export class DeploymentReadinessService {
  static async build(tenantId: string) {
    const [posture, policy] = await Promise.all([
      SecurityPostureService.getSnapshot(tenantId),
      SecurityPolicyService.getPolicy(tenantId),
    ]);

    const roots = repoRootCandidates();
    const caddyCandidates = roots.map((root) => path.join(root, 'Caddyfile.production'));
    const composeCandidates = roots.map((root) => path.join(root, 'docker-compose.prod.yml'));
    const caddyPath = caddyCandidates[0];
    const composePath = composeCandidates[0];

    let caddyExists = false;
    for (const candidate of caddyCandidates) {
      if (await fileExists(candidate)) {
        caddyExists = true;
        break;
      }
    }

    let composeContents = '';
    for (const candidate of composeCandidates) {
      if (await fileExists(candidate)) {
        composeContents = await readFileIfExists(candidate);
        break;
      }
    }
    const composeExists = Boolean(composeContents);

    const tlsEnvConfigured = Boolean(process.env.CAMEL_DOMAIN && process.env.CAMEL_TLS_EMAIL);
    const reverseProxyConfigured = caddyExists && composeContents.includes('caddy');

    const checks: ReadinessCheck[] = [
      {
        key: 'reverse_proxy',
        title: 'Reverse Proxy',
        status: reverseProxyConfigured ? 'pass' : 'fail',
        detail: reverseProxyConfigured
          ? 'Production compose and Caddy reverse proxy files are present.'
          : `Missing or incomplete production reverse proxy assets (${caddyPath}, ${composePath}).`,
      },
      {
        key: 'tls',
        title: 'TLS Readiness',
        status: tlsEnvConfigured ? 'pass' : 'warn',
        detail: tlsEnvConfigured
          ? 'CAMEL_DOMAIN and CAMEL_TLS_EMAIL are configured for managed TLS.'
          : 'TLS edge files exist, but CAMEL_DOMAIN/CAMEL_TLS_EMAIL are not set in the environment yet.',
      },
      {
        key: 'admin_allowlist',
        title: 'Admin Surface Fence',
        status: posture.adminAllowlistConfigured ? 'pass' : 'fail',
        detail: posture.adminAllowlistConfigured
          ? 'Admin IP allowlist is configured.'
          : 'Admin IP allowlist must be configured before public exposure.',
      },
      {
        key: 'sensitive_mfa',
        title: 'Sensitive MFA',
        status: policy.requireSensitiveMfa ? 'pass' : 'fail',
        detail: policy.requireSensitiveMfa
          ? 'Sensitive MFA enforcement is active.'
          : 'Sensitive MFA should be enabled before exposing Camel outside localhost.',
      },
      {
        key: 'api_docs',
        title: 'Sensitive Surface Exposure',
        status: !config.security.exposeApiDocs && !config.security.exposeBullBoard ? 'pass' : 'warn',
        detail: !config.security.exposeApiDocs && !config.security.exposeBullBoard
          ? 'API docs and Bull Board are closed by default.'
          : 'One or more sensitive surfaces are enabled and should be fenced before exposure.',
      },
      {
        key: 'scheduled_posture',
        title: 'Scheduled Security Reporting',
        status: policy.reportSchedule.enabled ? 'pass' : 'warn',
        detail: policy.reportSchedule.enabled
          ? `Tenant posture snapshots run every ${policy.reportSchedule.intervalHours} hour(s).`
          : 'Scheduled posture reporting is disabled.',
      },
    ];

    const blockers = checks.filter((check) => check.status === 'fail').map((check) => check.title);
    const warnings = checks.filter((check) => check.status === 'warn').map((check) => check.title);

    return {
      tenantId,
      generatedAt: new Date().toISOString(),
      status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'caution' : 'ready',
      checks,
      blockers,
      warnings,
      recommendations: checks
        .filter((check) => check.status !== 'pass')
        .map((check) => `${check.title}: ${check.detail}`),
    };
  }
}

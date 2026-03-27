import net from 'net';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { RuntimeEnvironmentMode, RuntimeEnvironmentService } from './runtimeEnvironment.service';

export interface ProxyHealthPreflightOptions {
  tenantId?: string | null;
  environment?: RuntimeEnvironmentMode;
  freshnessMs?: number;
  connectTimeoutMs?: number;
  force?: boolean;
}

export interface ProxyHealthPreflightResult {
  endpointId: string;
  ok: boolean;
  latencyMs: number;
  error: string | null;
  status: 'ACTIVE' | 'DEGRADED' | 'UNHEALTHY';
  checkedAt: string;
  cached: boolean;
}

interface ProxyHealthAdapter {
  preflight(endpoint: any, options: ProxyHealthPreflightOptions): Promise<ProxyHealthPreflightResult>;
}

const DEFAULT_FRESHNESS_MS = 2 * 60 * 1000;
const DEFAULT_CONNECT_TIMEOUT_MS = 2000;

class SandboxProxyHealthAdapter implements ProxyHealthAdapter {
  async preflight(endpoint: any): Promise<ProxyHealthPreflightResult> {
    const status = String(endpoint?.status || 'ACTIVE').toUpperCase();
    return {
      endpointId: endpoint.id,
      ok: status !== 'UNHEALTHY',
      latencyMs: Number(endpoint?.lastLatencyMs || 0),
      error: endpoint?.lastError || null,
      status: status === 'UNHEALTHY' ? 'UNHEALTHY' : 'ACTIVE',
      checkedAt: endpoint?.lastCheck ? new Date(endpoint.lastCheck).toISOString() : new Date().toISOString(),
      cached: true,
    };
  }
}

class ProductionProxyHealthAdapter implements ProxyHealthAdapter {
  async preflight(endpoint: any, options: ProxyHealthPreflightOptions): Promise<ProxyHealthPreflightResult> {
    const freshnessMs = Math.max(1000, Number(options.freshnessMs || DEFAULT_FRESHNESS_MS));
    const connectTimeoutMs = Math.max(250, Number(options.connectTimeoutMs || DEFAULT_CONNECT_TIMEOUT_MS));
    const lastCheckAt = endpoint?.lastCheck ? new Date(endpoint.lastCheck).getTime() : 0;
    const status = String(endpoint?.status || 'ACTIVE').toUpperCase();
    const stillFresh = !options.force && lastCheckAt > 0 && (Date.now() - lastCheckAt) < freshnessMs;

    if (stillFresh && ['ACTIVE', 'DEGRADED'].includes(status)) {
      return {
        endpointId: endpoint.id,
        ok: status === 'ACTIVE',
        latencyMs: Number(endpoint?.lastLatencyMs || 0),
        error: endpoint?.lastError || null,
        status: status as 'ACTIVE' | 'DEGRADED',
        checkedAt: new Date(lastCheckAt).toISOString(),
        cached: true,
      };
    }

    const probe = await probeTcp(endpoint.host, Number(endpoint.port), connectTimeoutMs);
    let httpOk = true;
    let httpError = null;

    if (probe.ok) {
      // Phase 2 Improvement: Real HTTP Probe
      const httpProbe = await this.probeHttp(endpoint, connectTimeoutMs * 2);
      httpOk = httpProbe.ok;
      httpError = httpProbe.error;
    }

    const failureKey = `v3:proxy:fail:${endpoint.id}`;
    const overallOk = probe.ok && httpOk;
    const failures = overallOk ? 0 : Number(await redis.incr(failureKey));
    
    if (overallOk) {
      await redis.del(failureKey);
    } else {
      await redis.expire(failureKey, 60 * 60);
    }

    const nextStatus: 'ACTIVE' | 'DEGRADED' | 'UNHEALTHY' = overallOk
      ? 'ACTIVE'
      : failures >= 3
        ? 'UNHEALTHY'
        : 'DEGRADED';

    try {
      await (prisma as any).proxyEndpoint.update({
        where: { id: endpoint.id },
        data: {
          lastCheck: new Date(),
          lastLatencyMs: probe.latencyMs,
          lastError: overallOk ? null : (httpError || probe.error || 'connect_failed'),
          failureCount: failures,
          status: nextStatus,
        },
      });
    } catch (_error) {
      // tolerate schema drift
    }

    const result: ProxyHealthPreflightResult = {
      endpointId: endpoint.id,
      ok: overallOk,
      latencyMs: probe.latencyMs,
      error: httpError || probe.error || null,
      status: nextStatus,
      checkedAt: new Date().toISOString(),
      cached: false,
    };

    if (!probe.ok) {
      logger.warn('Proxy preflight failed', {
        endpointId: endpoint.id,
        host: endpoint.host,
        port: endpoint.port,
        error: result.error,
        status: result.status,
      });
    }

    return result;
  }

  private async probeHttp(endpoint: any, timeoutMs: number): Promise<{ ok: boolean; error?: string }> {
    try {
      const protocol = String(endpoint.protocol || 'http').toLowerCase();
      const proxyUrl = `${protocol}://${endpoint.username ? `${endpoint.username}:${endpoint.password}@` : ''}${endpoint.host}:${endpoint.port}`;
      const agent = new HttpsProxyAgent(proxyUrl);
      
      const response = await axios.get('https://www.google.com/generate_204', {
        proxy: false,
        httpsAgent: agent,
        timeout: timeoutMs,
        validateStatus: () => true,
      });

      return { ok: response.status === 204 || response.status === 200 };
    } catch (err: any) {
      return { ok: false, error: `http_${err.code || 'error'}` };
    }
  }
}

const sandboxAdapter = new SandboxProxyHealthAdapter();
const productionAdapter = new ProductionProxyHealthAdapter();

export class ProxyHealthService {
  static async preflight(endpoint: any, options: ProxyHealthPreflightOptions = {}) {
    const environment = await RuntimeEnvironmentService.resolve({
      tenantId: options.tenantId,
      explicitMode: options.environment,
    });
    const adapter = environment === 'sandbox' ? sandboxAdapter : productionAdapter;
    return adapter.preflight(endpoint, options);
  }

  static async preflightCandidates(endpoints: any[], options: ProxyHealthPreflightOptions = {}) {
    const results = await Promise.all(endpoints.map(async (endpoint) => ({
      endpoint,
      result: await this.preflight(endpoint, options),
    })));

    return {
      healthy: results.filter((item) => item.result.ok).map((item) => item.endpoint),
      degraded: results.filter((item) => item.result.status === 'DEGRADED').map((item) => item.endpoint),
      unhealthy: results.filter((item) => item.result.status === 'UNHEALTHY').map((item) => item.endpoint),
      results: results.map((item) => item.result),
    };
  }
}

function probeTcp(host: string, port: number, timeoutMs: number): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = new net.Socket();

    const finalize = (ok: boolean, error?: string) => {
      const latencyMs = Date.now() - startedAt;
      socket.destroy();
      resolve({ ok, latencyMs, error });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false, 'timeout'));
    socket.once('error', (err: any) => finalize(false, err?.code || err?.message || 'connect_error'));
    socket.connect(port, host);
  });
}

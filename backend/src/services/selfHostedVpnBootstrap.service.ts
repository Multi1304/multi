import { prisma } from '../prisma';
import { EgressDependencyReportService } from './egressDependencyReport.service';
import { EgressLanePlannerService } from './egressLanePlanner.service';
import { NetworkObservabilityService } from './networkObservability.service';
import { PoolSizingPlannerService } from './poolSizingPlanner.service';
import { ProxyHealthService } from './proxyHealth.service';

type SelfHostedExitInput = {
  name: string;
  host: string;
  port: number;
  protocol?: string | null;
  username?: string | null;
  password?: string | null;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  group?: string | null;
  cluster?: string | null;
  provider?: string | null;
  activate?: boolean;
  localInterfaceBinding?: string | null;
};

export class SelfHostedVpnBootstrapService {
  static async getPack(tenantId: string) {
    const [report, planner, observability, sizing, profiles] = await Promise.all([
      EgressDependencyReportService.getReport(tenantId),
      EgressLanePlannerService.getPlan(tenantId),
      NetworkObservabilityService.getSnapshot(tenantId),
      PoolSizingPlannerService.getPlan(tenantId),
      (prisma.profile as any).findMany({
        where: { tenantId },
        select: { id: true, name: true, platform: true, geolocation: true },
        orderBy: [{ createdAt: 'asc' }],
        take: 100,
      }),
    ]);

    const currentExits = Number(observability.vpnCluster?.healthyExitCount || 0);
    const recommendedExitCount = Math.max(2, Math.min(4, Math.ceil((sizing.hybridPlan?.vpnSeats || 1) / 2)));
    const stillNeeded = Math.max(0, recommendedExitCount - currentExits);

    const geoDemand = new Map<string, { country: string; count: number }>();
    for (const profile of profiles) {
      const geo = profile.geolocation as any;
      const country = String(geo?.country || geo?.countryCode || '').trim().toLowerCase();
      if (!country) continue;
      const current = geoDemand.get(country) || { country, count: 0 };
      current.count += 1;
      geoDemand.set(country, current);
    }
    const prioritizedGeos = Array.from(geoDemand.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map((item) => item.country);

    const exitTemplates = Array.from({ length: recommendedExitCount }).map((_, index) => {
      const laneGroup = index === 0
        ? 'stable_internal'
        : index === 1
          ? 'geo_sensitive'
          : index === 2
            ? 'overflow_backup'
            : 'high_separation';
      const geo = prioritizedGeos[index] || prioritizedGeos[0] || 'es';
      return {
        name: `wg-exit-${index + 1}`,
        provider: 'SELF_HOSTED_WIREGUARD',
        endpointType: 'VPN',
        metadata: {
          cluster: `wg-cluster-${index + 1}`,
          group: laneGroup,
          country: geo,
        },
        why: laneGroup === 'stable_internal'
          ? 'First lane for sticky groups that should leave proxyless but still stay on your own egress.'
          : laneGroup === 'geo_sensitive'
            ? 'Second lane for the most demanded geo among your own profiles.'
            : laneGroup === 'overflow_backup'
              ? 'Third lane for backup/failover before any paid spill.'
              : 'Fourth lane for higher-separation traffic before commercial overflow.',
      };
    });
    const poolBlueprints = this.buildPoolBlueprints(exitTemplates);

    return {
      summary:
        currentExits > 0
          ? `Camel currently sees ${currentExits} healthy self-hosted exit(s). The practical target is ${recommendedExitCount}.`
          : `Camel currently sees no healthy self-hosted exits. The practical starting target is ${recommendedExitCount}.`,
      currentExits,
      recommendedExitCount,
      stillNeeded,
      prioritizedGeos,
      laneIntent: planner.assignmentRules,
      poolBlueprints,
      templates: exitTemplates,
      executionPlan: [
        'Stand up 2-4 self-hosted VPN exits before expecting useful network separation from your own egress.',
        'Separate exits by use group, not only by raw count: stable_internal, geo_sensitive, overflow_backup, high_separation.',
        'Choose geos from actual profile demand, not decorative country lists.',
        'Keep proxyless as the default lane for builder, sandbox, QA and low-separation work.',
        'Treat commercial pool as overflow only for geo gaps, overflow and high-separation cases that your own exits cannot cover.',
        'Keep metadata, health checks, sticky routing and failover pristine so the self-hosted exits behave like a real small pool.',
        'Grow the number of healthy self-hosted exits before expanding purchased proxies.',
      ],
      readinessChecks: [
        'Each exit has explicit provider=SELF_HOSTED_* and endpointType=VPN.',
        'Each exit has cluster metadata so Camel can place it into the right lane.',
        'Each exit has country/city/provider metadata for steering and observability.',
        'Each exit passes health checks and stays sticky-safe before taking production traffic.',
      ],
      registrationFormat: {
        fields: ['name', 'host', 'port', 'country', 'city', 'group', 'cluster', 'protocol', 'username', 'password'],
        exampleLines: exitTemplates.map((item) => `${item.name},vpn-${item.metadata.group}.example.net,1080,${item.metadata.country},,${item.metadata.group},${item.metadata.cluster},HTTP,,`),
      },
      deploymentArtifacts: [
        'deploy/self-hosted-vpn/README.md',
        'deploy/self-hosted-vpn/PARALLEL-ROLLOUT.md',
        'deploy/self-hosted-vpn/docker-compose.wireguard.yml',
        'deploy/self-hosted-vpn/docker-compose.multi-exit.yml',
        'deploy/self-hosted-vpn/wg-exit.env.example',
        'deploy/self-hosted-vpn/exits/bootstrap.inventory.json',
        'deploy/self-hosted-vpn/exits/wg-exit-1.env.example',
        'deploy/self-hosted-vpn/exits/wg-exit-2.env.example',
        'deploy/self-hosted-vpn/exits/wg-exit-3.env.example',
        'deploy/self-hosted-vpn/exits/wg-exit-4.env.example',
      ],
      minimizationContext: {
        commercialPercent: report.currentCapacity.commercialPool.percentOfConcurrency,
        selfHostedPercent: report.currentCapacity.selfHostedVpn.percentOfConcurrency,
      },
    };
  }

  static async ensureSuggestedPools(tenantId: string) {
    const pack = await this.getPack(tenantId);
    const existingPools = await (prisma.proxyPool as any).findMany({
      where: { tenantId },
      orderBy: [{ name: 'asc' }],
    });

    const createdPools: any[] = [];
    const reusedPools: any[] = [];
    for (const blueprint of pack.poolBlueprints || []) {
      const existing = existingPools.find((pool: any) => {
        const settings = pool.settings || {};
        return settings.bootstrapGroup === blueprint.group || pool.name === blueprint.name;
      });

      if (existing) {
        reusedPools.push(existing);
        continue;
      }

      const pool = await (prisma.proxyPool as any).create({
        data: {
          tenantId,
          name: blueprint.name,
          description: blueprint.description,
          rotationStrategy: 'STICKY_PER_PROFILE',
          type: 'VPN',
          provider: 'SELF_HOSTED_WIREGUARD',
          settings: {
            bootstrapManaged: true,
            bootstrapGroup: blueprint.group,
            clusterPrefix: blueprint.clusterPrefix,
            intendedGeo: blueprint.intendedGeo,
            useCase: blueprint.useCase,
            preferredCommercialSpill: false,
          },
        },
      });
      createdPools.push(pool);
      existingPools.push(pool);
    }

    return {
      summary: createdPools.length > 0
        ? `Created ${createdPools.length} self-hosted VPN pool scaffold(s).`
        : 'All suggested self-hosted VPN pools already exist.',
      createdPools,
      reusedPools,
      poolBlueprints: pack.poolBlueprints,
    };
  }

  static async registerExits(tenantId: string, exits: SelfHostedExitInput[]) {
    const sanitizedExits = exits
      .map((exit) => ({
        ...exit,
        group: String(exit.group || '').trim() || 'stable_internal',
        cluster: String(exit.cluster || '').trim() || `wg-${String(exit.group || 'stable_internal').trim() || 'stable_internal'}-1`,
        provider: String(exit.provider || '').trim() || 'SELF_HOSTED_WIREGUARD',
        protocol: String(exit.protocol || '').trim() || 'HTTP',
        activate: exit.activate !== false,
      }))
      .filter((exit) => exit.name && exit.host && Number(exit.port) > 0);

    if (!sanitizedExits.length) {
      return {
        summary: 'No valid self-hosted exits were provided.',
        createdEndpoints: [],
        updatedEndpoints: [],
        poolsTouched: [],
      };
    }

    const existingPools = await (prisma.proxyPool as any).findMany({
      where: { tenantId },
      orderBy: [{ name: 'asc' }],
    });

    const poolsByGroup = new Map<string, any>();
    for (const pool of existingPools) {
      const settings = pool.settings || {};
      if (settings.bootstrapGroup) {
        poolsByGroup.set(String(settings.bootstrapGroup), pool);
      }
    }

    const poolsTouched = new Map<string, any>();
    const createdEndpoints: any[] = [];
    const updatedEndpoints: any[] = [];

    for (const exit of sanitizedExits) {
      let pool = poolsByGroup.get(exit.group!);
      if (!pool) {
        pool = await (prisma.proxyPool as any).create({
          data: {
            tenantId,
            name: this.toPoolName(exit.group!),
            description: `Bootstrap-managed self-hosted VPN lane for ${exit.group}.`,
            rotationStrategy: 'STICKY_PER_PROFILE',
            type: 'VPN',
            provider: exit.provider,
            settings: {
              bootstrapManaged: true,
              bootstrapGroup: exit.group,
              clusterPrefix: exit.cluster,
              preferredCommercialSpill: false,
            },
          },
        });
        poolsByGroup.set(exit.group!, pool);
      }
      poolsTouched.set(pool.id, pool);

      const existingEndpoint = await (prisma.proxyEndpoint as any).findFirst({
        where: {
          tenantId,
          OR: [
            { host: exit.host, port: Number(exit.port) },
            {
              metadata: {
                path: ['cluster'],
                equals: exit.cluster,
              },
            },
          ],
        },
      }).catch(async () => {
        const endpoints = await (prisma.proxyEndpoint as any).findMany({
          where: { tenantId },
        });
        return endpoints.find((item: any) => (
          (item.host === exit.host && Number(item.port) === Number(exit.port)) ||
          String(item.metadata?.cluster || '') === String(exit.cluster)
        )) || null;
      });

      const payload = {
        tenantId,
        poolId: pool.id,
        host: exit.host,
        port: Number(exit.port),
        username: exit.username || null,
        password: exit.password || null,
        protocol: exit.protocol || 'HTTP',
        country: exit.country || null,
        city: exit.city || null,
        region: exit.region || null,
        provider: exit.provider || 'SELF_HOSTED_WIREGUARD',
        endpointType: 'VPN',
        isActive: exit.activate !== false,
        status: exit.activate === false ? 'DISABLED' : 'ACTIVE',
        metadata: {
          bootstrapManaged: true,
          cluster: exit.cluster,
          group: exit.group,
          lanePurpose: exit.group,
          selfHosted: true,
          deploymentModel: 'wireguard_exit',
          localInterfaceBinding: (exit as any).localInterfaceBinding || null,
        },
      };

      if (existingEndpoint) {
        const updated = await (prisma.proxyEndpoint as any).update({
          where: { id: existingEndpoint.id },
          data: payload,
        });
        updatedEndpoints.push(updated);
      } else {
        const created = await (prisma.proxyEndpoint as any).create({
          data: payload,
        });
        createdEndpoints.push(created);
      }
    }

    return {
      summary: `Registered ${createdEndpoints.length} new self-hosted exit(s) and updated ${updatedEndpoints.length}.`,
      createdEndpoints,
      updatedEndpoints,
      poolsTouched: Array.from(poolsTouched.values()),
    };
  }

  static previewImport(payload: string, format?: 'csv' | 'json') {
    const normalizedPayload = String(payload || '').trim();
    if (!normalizedPayload) {
      return {
        detectedFormat: format || 'csv',
        valid: false,
        exits: [],
        warnings: ['No import payload provided.'],
      };
    }

    const exits = format === 'json' || normalizedPayload.startsWith('[') || normalizedPayload.startsWith('{')
      ? this.parseJsonImport(normalizedPayload)
      : this.parseCsvImport(normalizedPayload);

    const warnings = exits.flatMap((item, index) => {
      const itemWarnings: string[] = [];
      if (!item.country) itemWarnings.push(`Line ${index + 1}: country is missing.`);
      if (!item.group) itemWarnings.push(`Line ${index + 1}: group is missing.`);
      if (!item.cluster) itemWarnings.push(`Line ${index + 1}: cluster is missing.`);
      return itemWarnings;
    });

    return {
      detectedFormat: format || (normalizedPayload.startsWith('[') || normalizedPayload.startsWith('{') ? 'json' : 'csv'),
      valid: exits.length > 0,
      exits,
      warnings,
    };
  }

  static async getOnboardingChecklist(tenantId: string, forcePreflight = false) {
    const endpoints = await (prisma.proxyEndpoint as any).findMany({
      where: { tenantId },
      include: { pool: true },
      orderBy: [{ host: 'asc' }],
    });

    const selfHostedEndpoints = endpoints.filter((endpoint: any) => (
      String(endpoint.endpointType || '').toUpperCase() === 'VPN' &&
      String(endpoint.provider || '').toUpperCase().includes('SELF_HOSTED')
    ));

    const rows = await Promise.all(selfHostedEndpoints.map(async (endpoint: any) => {
      const metadata = endpoint.metadata || {};
      const health = await ProxyHealthService.preflight(endpoint, {
        tenantId,
        force: forcePreflight,
      }).catch(() => ({
        endpointId: endpoint.id,
        ok: false,
        latencyMs: 0,
        error: 'preflight_failed',
        status: 'UNHEALTHY',
        checkedAt: new Date().toISOString(),
        cached: false,
      }));

      const checks = [
        { key: 'provider', ok: String(endpoint.provider || '').toUpperCase().includes('SELF_HOSTED'), label: 'Self-hosted provider set' },
        { key: 'endpointType', ok: String(endpoint.endpointType || '').toUpperCase() === 'VPN', label: 'Endpoint type is VPN' },
        { key: 'cluster', ok: !!metadata.cluster, label: 'Cluster metadata present' },
        { key: 'group', ok: !!metadata.group, label: 'Group metadata present' },
        { key: 'country', ok: !!endpoint.country, label: 'Country metadata present' },
        { key: 'health', ok: !!health.ok, label: 'Health preflight passed' },
      ];

      return {
        id: endpoint.id,
        name: `${endpoint.host}:${endpoint.port}`,
        host: endpoint.host,
        port: endpoint.port,
        poolName: endpoint.pool?.name || null,
        cluster: metadata.cluster || null,
        group: metadata.group || null,
        country: endpoint.country || null,
        city: endpoint.city || null,
        status: endpoint.status || 'ACTIVE',
        health,
        checks,
        ready: checks.every((item) => item.ok),
      };
    }));

    return {
      summary: rows.length
        ? `${rows.filter((item) => item.ready).length}/${rows.length} self-hosted exits are ready for lane assignment.`
        : 'No self-hosted exits registered yet.',
      rows,
      recommendedActions: [
        'Fill missing cluster/group/country metadata before assigning production traffic.',
        'Run preflight again after provisioning to verify that the exit is reachable.',
        'Keep sticky and failover on top of healthy self-hosted exits before increasing concurrency.',
      ],
    };
  }

  static async getTopologyPlan(tenantId: string) {
    const pack = await this.getPack(tenantId);
    const recommended = Math.max(2, Math.min(4, Number(pack.recommendedExitCount || 2)));
    const geos = Array.isArray(pack.prioritizedGeos) && pack.prioritizedGeos.length
      ? pack.prioritizedGeos
      : ['es', 'pt'];
    const hostRoles = [
      {
        exit: 'wg-exit-1',
        group: 'stable_internal',
        purpose: 'First sticky lane outside proxyless for steady internal work.',
        minProfiles: 4,
        maxProfiles: 8,
      },
      {
        exit: 'wg-exit-2',
        group: 'geo_sensitive',
        purpose: 'Geo-targeted work before any commercial spill.',
        minProfiles: 3,
        maxProfiles: 6,
      },
      {
        exit: 'wg-exit-3',
        group: 'overflow_backup',
        purpose: 'Backup and failover lane before commercial overflow.',
        minProfiles: 2,
        maxProfiles: 5,
      },
      {
        exit: 'wg-exit-4',
        group: 'high_separation',
        purpose: 'Higher-separation lane that should still exhaust own egress first.',
        minProfiles: 2,
        maxProfiles: 4,
      },
    ].slice(0, recommended);

    const hosts = hostRoles.map((item, index) => {
      const geo = item.group === 'geo_sensitive'
        ? (geos[1] || geos[0] || 'pt')
        : item.group === 'high_separation'
          ? (geos[2] || geos[0] || 'es')
          : (geos[0] || 'es');
      return {
        hostname: `${item.exit}.${geo}.camel.internal`,
        exit: item.exit,
        group: item.group,
        geo,
        role: item.purpose,
        sizing: {
          vcpu: item.group === 'high_separation' ? 2 : 1,
          memoryGb: item.group === 'stable_internal' ? 2 : 1,
          diskGb: 20,
        },
        capacity: {
          recommendedProfiles: `${item.minProfiles}-${item.maxProfiles}`,
          stickyPolicy: 'STICKY_PER_PROFILE',
        },
        deploymentOrder: index + 1,
      };
    });

    return {
      summary: `Plan ${hosts.length} self-hosted VPN host(s) in parallel before expecting meaningful commercial reduction.`,
      topologyMode: hosts.length >= 4 ? 'parallel-four-exit' : 'parallel-minimum',
      hosts,
      rolloutPhases: [
        'Phase 1: stable_internal + geo_sensitive go live first.',
        'Phase 2: overflow_backup joins for failover headroom.',
        'Phase 3: high_separation joins before allowing sensitive traffic to spill commercial.',
      ],
      guidance: [
        'Use one host or VPS per exit for cleaner failure domains.',
        'Choose geos from real profile demand, not decorative spread.',
        'Prefer adding a healthy own host before increasing paid commercial endpoints.',
      ],
    };
  }

  private static buildPoolBlueprints(exitTemplates: any[]) {
    const grouped = new Map<string, any>();
    for (const template of exitTemplates) {
      const group = String(template.metadata?.group || 'stable_internal');
      if (grouped.has(group)) continue;
      grouped.set(group, {
        name: this.toPoolName(group),
        group,
        clusterPrefix: template.metadata?.cluster,
        intendedGeo: template.metadata?.country || null,
        useCase: this.describeGroup(group),
        description: `Bootstrap-managed self-hosted VPN pool for ${group}.`,
      });
    }
    return Array.from(grouped.values());
  }

  private static toPoolName(group: string) {
    return `Self-Hosted ${group.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}`;
  }

  private static describeGroup(group: string) {
    switch (group) {
      case 'stable_internal':
        return 'Sticky first-party traffic that should leave proxyless while still using your own egress.';
      case 'geo_sensitive':
        return 'Profiles that truly need your most demanded geo before spending commercial capacity.';
      case 'overflow_backup':
        return 'Fallback lane before any commercial spill.';
      case 'high_separation':
        return 'Higher-separation work that should exhaust your own exits first.';
      default:
        return 'Self-hosted VPN traffic grouped by operational intent.';
    }
  }

  private static parseCsvImport(payload: string): SelfHostedExitInput[] {
    return payload
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, host, port, country, city, group, cluster, protocol, username, password] = line.split(',').map((part) => part.trim());
        return {
          name,
          host,
          port: Number(port),
          country: country || undefined,
          city: city || undefined,
          group: group || undefined,
          cluster: cluster || undefined,
          protocol: protocol || undefined,
          username: username || undefined,
          password: password || undefined,
        };
      })
      .filter((item) => item.name && item.host && Number.isFinite(item.port) && item.port > 0) as SelfHostedExitInput[];
  }

  private static parseJsonImport(payload: string): SelfHostedExitInput[] {
    try {
      const parsed = JSON.parse(payload);
      const array = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.exits) ? parsed.exits : [];
      return array
        .map((item: any) => ({
          name: String(item?.name || '').trim(),
          host: String(item?.host || '').trim(),
          port: Number(item?.port),
          country: item?.country ? String(item.country).trim() : undefined,
          city: item?.city ? String(item.city).trim() : undefined,
          group: item?.group ? String(item.group).trim() : undefined,
          cluster: item?.cluster ? String(item.cluster).trim() : undefined,
          protocol: item?.protocol ? String(item.protocol).trim() : undefined,
          username: item?.username ? String(item.username).trim() : undefined,
          password: item?.password ? String(item.password).trim() : undefined,
        }))
        .filter((item: SelfHostedExitInput) => item.name && item.host && Number.isFinite(item.port) && item.port > 0);
    } catch {
      return [];
    }
  }
}

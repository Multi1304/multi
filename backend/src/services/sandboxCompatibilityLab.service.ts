import crypto from 'crypto';
import { prisma } from '../prisma';
import { SelectorAssistService } from './selectorAssist.service';
import { redis } from '../utils/redis';

export interface SandboxScenario {
  id: string;
  name: string;
  version: string;
  stage: string;
  controlKind: 'input' | 'select' | 'combobox' | 'button';
  label: string;
  localeHints: string[];
  expectedSelectors: string[];
  snapshot: string;
  tags: string[];
  updatedAt: string;
}

export interface SandboxLabSettings {
  scenarios: SandboxScenario[];
}

export interface SandboxScenarioEvaluation {
  scenarioId: string;
  name: string;
  version: string;
  stage: string;
  contractScore: number;
  selectorCoverage: number;
  topSuggestion: string | null;
  status: 'healthy' | 'warning' | 'critical';
  notes: string[];
}

export interface SandboxRegressionRun {
  id: string;
  tenantId: string;
  createdAt: string;
  summary: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
    averageScore: number;
  };
  rows: SandboxScenarioEvaluation[];
}

const DEFAULT_SETTINGS: SandboxLabSettings = {
  scenarios: [],
};

export class SandboxCompatibilityLabService {
  private static historyKey(tenantId: string) {
    return `v3:sandbox:lab:history:${tenantId}`;
  }

  static normalizeSettings(settings?: any): SandboxLabSettings {
    const raw = settings?.sandboxLab || {};
    return {
      scenarios: Array.isArray(raw.scenarios)
        ? raw.scenarios.map((scenario: any) => this.normalizeScenario(scenario)).filter(Boolean)
        : DEFAULT_SETTINGS.scenarios,
    };
  }

  private static normalizeScenario(input: any): SandboxScenario {
    return {
      id: typeof input?.id === 'string' && input.id ? input.id : crypto.randomUUID(),
      name: typeof input?.name === 'string' && input.name ? input.name : 'Unnamed sandbox scenario',
      version: typeof input?.version === 'string' && input.version ? input.version : 'v1',
      stage: typeof input?.stage === 'string' && input.stage ? input.stage : 'unknown',
      controlKind: ['input', 'select', 'combobox', 'button'].includes(input?.controlKind) ? input.controlKind : 'input',
      label: typeof input?.label === 'string' && input.label ? input.label : 'field',
      localeHints: Array.isArray(input?.localeHints) ? input.localeHints.map(String) : [],
      expectedSelectors: Array.isArray(input?.expectedSelectors) ? input.expectedSelectors.map(String) : [],
      snapshot: typeof input?.snapshot === 'string' ? input.snapshot : '',
      tags: Array.isArray(input?.tags) ? input.tags.map(String) : [],
      updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
    };
  }

  static async getSettings(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true }
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    return this.normalizeSettings(tenant.settings);
  }

  static async saveScenario(tenantId: string, input: Partial<SandboxScenario>) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true }
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const current = this.normalizeSettings(tenant.settings);
    const nextScenario = this.normalizeScenario({
      ...input,
      updatedAt: new Date().toISOString(),
    });
    const scenarios = [...current.scenarios];
    const idx = scenarios.findIndex((scenario) => scenario.id === nextScenario.id);
    if (idx >= 0) {
      scenarios[idx] = nextScenario;
    } else {
      scenarios.unshift(nextScenario);
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...((tenant.settings as any) || {}),
          sandboxLab: { scenarios }
        } as any
      }
    });

    return nextScenario;
  }

  static async deleteScenario(tenantId: string, scenarioId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true }
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const current = this.normalizeSettings(tenant.settings);
    const scenarios = current.scenarios.filter((scenario) => scenario.id !== scenarioId);

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...((tenant.settings as any) || {}),
          sandboxLab: { scenarios }
        } as any
      }
    });
  }

  static evaluateScenario(scenario: SandboxScenario): SandboxScenarioEvaluation {
    const analysis = SelectorAssistService.analyzeSnapshot(scenario.snapshot, {
      label: scenario.label,
      controlKind: scenario.controlKind,
      localeHints: scenario.localeHints,
    });
    const snapshotLower = scenario.snapshot.toLowerCase();
    const matchedSelectors = scenario.expectedSelectors.filter((selector) => this.selectorExistsInSnapshot(selector, scenario.snapshot));
    const selectorCoverage = scenario.expectedSelectors.length > 0
      ? Math.round((matchedSelectors.length / scenario.expectedSelectors.length) * 100)
      : 0;

    const tokenHits = analysis.tokens.filter((token) => snapshotLower.includes(token.toLowerCase())).length;
    const tokenScore = analysis.tokens.length > 0
      ? Math.round((tokenHits / analysis.tokens.length) * 100)
      : 0;

    const contractScore = Math.max(0, Math.min(100, Math.round((selectorCoverage * 0.55) + (tokenScore * 0.45))));
    const topSuggestion = analysis.suggestions[0]?.selector || null;
    const status = contractScore >= 80 ? 'healthy' : contractScore >= 55 ? 'warning' : 'critical';
    const notes: string[] = [];

    if (matchedSelectors.length === 0 && scenario.expectedSelectors.length > 0) {
      notes.push('Expected selectors are not represented in the current snapshot.');
    }
    if (analysis.suggestions.length === 0) {
      notes.push('Selector assist did not find strong candidates from the snapshot attributes.');
    } else if (topSuggestion && !scenario.expectedSelectors.includes(topSuggestion)) {
      notes.push(`Top alternative selector candidate: ${topSuggestion}`);
    }
    if (!snapshotLower.includes(scenario.stage.toLowerCase()) && scenario.stage !== 'unknown') {
      notes.push(`Stage token "${scenario.stage}" is not obviously present in the snapshot.`);
    }

    return {
      scenarioId: scenario.id,
      name: scenario.name,
      version: scenario.version,
      stage: scenario.stage,
      contractScore,
      selectorCoverage,
      topSuggestion,
      status,
      notes,
    };
  }

  static async evaluateAll(tenantId: string) {
    const settings = await this.getSettings(tenantId);
    const rows = settings.scenarios.map((scenario) => this.evaluateScenario(scenario));
    const summary = {
      total: rows.length,
      healthy: rows.filter((row) => row.status === 'healthy').length,
      warning: rows.filter((row) => row.status === 'warning').length,
      critical: rows.filter((row) => row.status === 'critical').length,
      averageScore: rows.length > 0
        ? Math.round(rows.reduce((sum, row) => sum + row.contractScore, 0) / rows.length)
        : 0,
    };

    return {
      settings,
      summary,
      rows: rows.sort((a, b) => a.contractScore - b.contractScore),
    };
  }

  static async runRegressionSuite(tenantId: string) {
    const evaluation = await this.evaluateAll(tenantId);
    const record: SandboxRegressionRun = {
      id: crypto.randomUUID(),
      tenantId,
      createdAt: new Date().toISOString(),
      summary: evaluation.summary,
      rows: evaluation.rows,
    };
    await redis.lpush(this.historyKey(tenantId), JSON.stringify(record));
    await redis.ltrim(this.historyKey(tenantId), 0, 19);
    return record;
  }

  static async getHistory(tenantId: string) {
    const rows = await redis.lrange(this.historyKey(tenantId), 0, 9);
    return rows.map((row) => JSON.parse(row) as SandboxRegressionRun);
  }

  private static selectorExistsInSnapshot(selector: string, snapshot: string) {
    const raw = selector.trim();
    const snapshotLower = snapshot.toLowerCase();
    if (!raw) return false;

    if (raw.startsWith('#')) {
      const id = raw.slice(1).toLowerCase();
      return snapshotLower.includes(`id="${id}"`) || snapshotLower.includes(`id='${id}'`);
    }

    const attrMatch = raw.match(/^\[([a-z0-9_-]+)=["']?([^"'\]]+)["']?\]$/i);
    if (attrMatch) {
      const [, attr, value] = attrMatch;
      return snapshotLower.includes(`${attr.toLowerCase()}="${value.toLowerCase()}"`)
        || snapshotLower.includes(`${attr.toLowerCase()}='${value.toLowerCase()}'`);
    }

    return snapshotLower.includes(raw.toLowerCase());
  }
}

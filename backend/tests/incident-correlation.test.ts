import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IncidentCorrelationService } from '../src/services/incidentCorrelation.service';
import { prisma } from '../src/prisma';

vi.mock('../src/prisma', () => ({
  prisma: {
    flowRun: {
      findMany: vi.fn(),
    },
    profile: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../src/services/flowRunAnalysis.service', () => ({
  FlowRunAnalysisService: {
    augmentRun: (run: any) => ({
      ...run,
      analysis: {
        errorClass: run.errorClass || 'selector_timeout',
        failedStepId: run.failedStepId || null,
      },
    }),
  },
}));

describe('incident correlation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attaches failed runs to release gate incidents', async () => {
    (prisma.flowRun.findMany as any).mockResolvedValue([
      { id: 'run-1', status: 'failed', flow: { name: 'Flow A', steps: [] }, steps: [], errorClass: 'selector_timeout' },
    ]);
    (prisma.profile.findMany as any).mockResolvedValue([
      { id: 'profile-1', name: 'Profile A', fingerprint: { validation: { score: 50 } }, proxyConfig: null, platform: 'DESKTOP' },
    ]);

    const incidents = await IncidentCorrelationService.enrichIncidents('tenant-1', [{
      id: 'incident-1',
      code: 'release_gate_failed',
      title: 'Release gates failing',
      severity: 'critical',
      status: 'open',
      source: 'release_gates',
      summary: 'Gate score low',
      evidence: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }] as any);

    expect(incidents[0].correlation.runs[0].flowName).toBe('Flow A');
  });

  it('attaches sandbox scenarios to sandbox incidents', async () => {
    (prisma.flowRun.findMany as any).mockResolvedValue([]);
    (prisma.profile.findMany as any).mockResolvedValue([]);

    const incidents = await IncidentCorrelationService.enrichIncidents(
      'tenant-1',
      [{
        id: 'incident-2',
        code: 'sandbox_lab_critical',
        title: 'Sandbox compatibility regression',
        severity: 'critical',
        status: 'open',
        source: 'sandbox',
        summary: 'Scenarios broken',
        evidence: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }] as any,
      {
        sandboxLabRows: [
          { scenarioId: 'sc-1', name: 'Email Step', version: 'v1', status: 'critical', contractScore: 40, topSuggestion: '#email' },
        ],
      }
    );

    expect(incidents[0].correlation.scenarios[0].name).toBe('Email Step');
  });
});

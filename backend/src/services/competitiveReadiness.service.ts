import { config } from '../config';

export interface ReadinessCategory {
  id: string;
  label: string;
  score: number;
  status: 'strong' | 'emerging' | 'behind';
  evidence: string[];
  gaps: string[];
  nextStep: string;
}

export class CompetitiveReadinessService {
  static async getReadinessMatrix() {
    const categories: ReadinessCategory[] = [
      {
        id: 'fingerprints',
        label: 'Fingerprint Quality',
        score: 68,
        status: 'emerging',
        evidence: [
          'Preset versioning and corpus-backed generation exist',
          'Consistency validation is already stored in profile fingerprints',
          'Fingerprint config is applied to persistent contexts'
        ],
        gaps: [
          'No browser-engine-backed validation loop yet',
          'No empirical scorecard against live browser telemetry'
        ],
        nextStep: 'Add benchmark validation runs per preset and browser family.'
      },
      {
        id: 'sessions',
        label: 'Session Semantics',
        score: config.profileSyncDir ? 74 : 60,
        status: 'emerging',
        evidence: [
          'Snapshots, restore, push sync, pull sync and diff are implemented',
          'Runtime lease locking exists per profile',
          'Activity trail and session snapshot are visible'
        ],
        gaps: [
          'Lease UX and conflict resolution are still basic',
          'No first-class multi-node conflict timeline yet'
        ],
        nextStep: 'Add lease takeover/force-release workflow and richer session timeline.'
      },
      {
        id: 'runtime',
        label: 'Runtime Determinism',
        score: config.browserRuntime.strictMode ? 70 : 58,
        status: 'emerging',
        evidence: [
          'Strict mode and policy service exist',
          'Diagnostics and stage detection are being extracted from browser.node.ts'
        ],
        gaps: [
          'Recovery, actions and selectors are still partially embedded in the runtime',
          'Behavior remains heuristic-heavy for some flows'
        ],
        nextStep: 'Finish splitting runtime into policy, stage, recovery and action services.'
      },
      {
        id: 'scale',
        label: 'Scale Observability',
        score: 77,
        status: 'strong',
        evidence: [
          'Paginated cache exists',
          'LiveOps exposes queue depth and latency history',
          'Profile sync metrics are tracked'
        ],
        gaps: [
          'No long-term historical warehouse',
          'No SLO/alert policy surfaces in UI yet'
        ],
        nextStep: 'Persist metrics longer and add threshold alerts.'
      },
      {
        id: 'collaboration',
        label: 'Enterprise Collaboration',
        score: 61,
        status: 'emerging',
        evidence: [
          'ACL and sharing foundations exist',
          'Profile activity is now visible in-product'
        ],
        gaps: [
          'Permissions UX is not yet enterprise-grade',
          'Audit visibility is fragmented across screens'
        ],
        nextStep: 'Centralize audit, role actions and profile ownership workflows.'
      },
      {
        id: 'productization',
        label: 'Templates and Guardrails',
        score: 64,
        status: 'emerging',
        evidence: [
          'Flow builder and execution preconditions exist',
          'Snapshot diff gives safer rollback/debug loops'
        ],
        gaps: [
          'Template lifecycle and bulk workflows are still thin',
          'Guardrails are stronger in backend than in UI authoring'
        ],
        nextStep: 'Add template validation, bulk operations and authoring scorecards.'
      }
    ];

    const overall = Math.round(categories.reduce((sum, item) => sum + item.score, 0) / categories.length);
    return {
      overall,
      status: overall >= 80 ? 'strong' : overall >= 65 ? 'emerging' : 'behind',
      categories,
      generatedAt: new Date().toISOString(),
      note: 'This matrix is an internal heuristic scorecard based on implemented platform capabilities, not an external benchmark.'
    };
  }
}

export interface FlowBenchmarkRow {
  flowId: string;
  flowName: string;
  runs: number;
  successRate: number;
  avgDurationMs: number;
  topErrorClass: string;
  stabilityScore: number;
}

export interface DimensionBenchmarkRow {
  key: string;
  label: string;
  runs: number;
  successRate: number;
  avgDurationMs: number;
  topErrorClass: string;
  stabilityScore: number;
}

export interface BenchmarkOverallSummary {
  totalRuns: number;
  averageStabilityScore: number;
  weakestFlowScore: number;
  strongestFlowScore: number;
  successRate: number;
}

export class PlatformBenchmarkService {
  static summarizeRuns(runs: any[]): FlowBenchmarkRow[] {
    const grouped = new Map<string, any[]>();
    for (const run of runs) {
      const key = run.flowId || run.id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(run);
    }

    return Array.from(grouped.entries()).map(([flowId, items]) => {
      const successCount = items.filter((item) => item.status === 'completed' || item.status === 'success').length;
      const durations = items.map((item) => Number(item.duration || 0)).filter((value) => value > 0);
      const avgDurationMs = durations.length > 0
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : 0;

      const errorCounter = new Map<string, number>();
      items.forEach((item) => {
        const errorClass = item.analysis?.errorClass || 'none';
        errorCounter.set(errorClass, (errorCounter.get(errorClass) || 0) + 1);
      });
      const [topErrorClass] = Array.from(errorCounter.entries()).sort((a, b) => b[1] - a[1])[0] || ['none', 0];

      const successRate = items.length > 0 ? successCount / items.length : 0;
      const stabilityScore = Math.max(0, Math.min(100, Math.round((successRate * 100) - Math.min(25, avgDurationMs / 1000))));

      return {
        flowId,
        flowName: items[0]?.flow?.name || 'Unknown Flow',
        runs: items.length,
        successRate: Math.round(successRate * 100),
        avgDurationMs,
        topErrorClass,
        stabilityScore,
      };
    }).sort((a, b) => a.stabilityScore - b.stabilityScore);
  }

  static summarizeProfiles(runs: any[]) {
    return this.summarizeDimension(runs, (run) => {
      const profileId = run?.result?.inputVariables?.profileId || run?.result?.profileId || 'unassigned';
      return {
        key: profileId,
        label: profileId === 'unassigned' ? 'Unassigned Profile' : `Profile ${String(profileId).slice(0, 8)}`,
      };
    });
  }

  static summarizePresets(runs: any[], profiles: any[] = []) {
    const profilePresetMap = new Map<string, string>();
    profiles.forEach((profile) => {
      const preset =
        profile?.fingerprint?.presetVersion ||
        profile?.fingerprintPresetId ||
        profile?.platform ||
        'unknown';
      profilePresetMap.set(profile.id, preset);
    });

    return this.summarizeDimension(runs, (run) => {
      const profileId = run?.result?.inputVariables?.profileId || run?.result?.profileId;
      const preset =
        run?.result?.inputVariables?.presetVersion ||
        run?.fingerprint?.presetVersion ||
        (profileId ? profilePresetMap.get(profileId) : null) ||
        'unknown';
      return {
        key: String(preset),
        label: `Preset ${preset}`,
      };
    });
  }

  static summarizeOverall(runs: any[]): BenchmarkOverallSummary {
    const rows = this.summarizeRuns(runs);
    const successfulRuns = runs.filter((item) => item.status === 'completed' || item.status === 'success').length;
    return {
      totalRuns: runs.length,
      averageStabilityScore: rows.length
        ? Math.round(rows.reduce((sum, row) => sum + row.stabilityScore, 0) / rows.length)
        : 0,
      weakestFlowScore: rows.length ? rows[0].stabilityScore : 0,
      strongestFlowScore: rows.length ? rows[rows.length - 1].stabilityScore : 0,
      successRate: runs.length ? Math.round((successfulRuns / runs.length) * 100) : 0,
    };
  }

  private static summarizeDimension(
    runs: any[],
    projector: (run: any) => { key: string; label: string }
  ): DimensionBenchmarkRow[] {
    const grouped = new Map<string, { label: string; items: any[] }>();
    for (const run of runs) {
      const { key, label } = projector(run);
      if (!grouped.has(key)) {
        grouped.set(key, { label, items: [] });
      }
      grouped.get(key)!.items.push(run);
    }

    return Array.from(grouped.entries()).map(([key, group]) => {
      const items = group.items;
      const successCount = items.filter((item) => item.status === 'completed' || item.status === 'success').length;
      const durations = items.map((item) => Number(item.duration || 0)).filter((value) => value > 0);
      const avgDurationMs = durations.length > 0
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : 0;
      const errorCounter = new Map<string, number>();
      items.forEach((item) => {
        const errorClass = item.analysis?.errorClass || 'none';
        errorCounter.set(errorClass, (errorCounter.get(errorClass) || 0) + 1);
      });
      const [topErrorClass] = Array.from(errorCounter.entries()).sort((a, b) => b[1] - a[1])[0] || ['none', 0];
      const successRate = items.length > 0 ? successCount / items.length : 0;
      const stabilityScore = Math.max(0, Math.min(100, Math.round((successRate * 100) - Math.min(25, avgDurationMs / 1000))));

      return {
        key,
        label: group.label,
        runs: items.length,
        successRate: Math.round(successRate * 100),
        avgDurationMs,
        topErrorClass,
        stabilityScore,
      };
    }).sort((a, b) => a.stabilityScore - b.stabilityScore);
  }
}

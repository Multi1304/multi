export class ProfileOperationalService {
  static summarize(profiles: any[]) {
    const rows = (profiles || []).map((profile: any) => {
      const validationScore = Number(profile?.fingerprint?.validation?.score || 0);
      const hasProxy = Boolean(profile?.proxyConfig);
      const severity =
        validationScore >= 85 ? 'healthy' : validationScore >= 65 ? 'warning' : 'critical';

      return {
        id: profile.id,
        name: profile.name,
        platform: profile.platform || 'DESKTOP',
        validationScore,
        presetVersion: profile?.fingerprint?.presetVersion || 'legacy',
        hasProxy,
        severity,
      };
    }).sort((a, b) => a.validationScore - b.validationScore);

    const total = rows.length;
    const averageValidation = total
      ? Math.round(rows.reduce((sum, row) => sum + row.validationScore, 0) / total)
      : 0;

    return {
      total,
      averageValidation,
      healthy: rows.filter((row) => row.severity === 'healthy').length,
      warning: rows.filter((row) => row.severity === 'warning').length,
      critical: rows.filter((row) => row.severity === 'critical').length,
      withProxy: rows.filter((row) => row.hasProxy).length,
      weakest: rows.slice(0, 5),
    };
  }
}

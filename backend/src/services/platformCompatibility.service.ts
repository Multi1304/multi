import os from 'os';

export class PlatformCompatibilityService {
  static getHostDescriptor() {
    return {
      os: os.platform(),
      arch: os.arch(),
      release: os.release(),
    };
  }

  static evaluate(fingerprint?: any) {
    const host = this.getHostDescriptor();
    const targetArch = String(fingerprint?.arch || '').toLowerCase() || 'unknown';
    const targetOs = String(fingerprint?.platformOS || fingerprint?.platform || '').toLowerCase() || 'unknown';
    const ua = String(fingerprint?.userAgent || '').toLowerCase();
    const notes: string[] = [];

    const archCompatible =
      targetArch === 'unknown'
        ? true
        : (host.arch === 'arm64' && targetArch.includes('arm')) ||
          (host.arch === 'x64' && (targetArch.includes('x64') || targetArch.includes('win64'))) ||
          (host.arch === 'ia32' && targetArch.includes('ia32'));

    const osHintCompatible =
      targetOs === 'unknown'
        ? true
        : (host.os === 'win32' && /windows|win/.test(targetOs)) ||
          (host.os === 'darwin' && /mac|ios|vision/.test(targetOs)) ||
          (host.os === 'linux' && /linux|android/.test(targetOs));

    if (!archCompatible) notes.push(`Target arch ${targetArch} differs from host ${host.arch}.`);
    if (!osHintCompatible) notes.push(`Target OS ${targetOs} differs from host ${host.os}.`);
    if (host.arch === 'arm64') notes.push('Host is arm64-ready.');
    if (/iphone|android|mobile/.test(ua)) notes.push('Fingerprint carries a mobile-style user agent.');

    const score = Math.max(0, 100 - (archCompatible ? 0 : 25) - (osHintCompatible ? 0 : 20));
    return {
      host,
      target: {
        arch: targetArch,
        os: targetOs,
      },
      score,
      status: score >= 85 ? 'strong' : score >= 60 ? 'warning' : 'critical',
      notes,
      userGuidance: score >= 85
        ? 'Host and fingerprint are broadly compatible.'
        : 'Review host/fingerprint pairing before relying on this profile across devices.',
    };
  }
}

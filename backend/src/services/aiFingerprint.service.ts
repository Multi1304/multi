import { logger } from '../utils/logger';
import { ArchService } from './arch.service';
import { FingerprintHardeningService } from './fingerprintHardening.service';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface FingerprintParams {
  platform: any;
  userAgent: string;
  screenResolution: string;
  language: string;
  platformOS: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  arch: string;
  canvas: any;
  webgl: any;
  audio: any;
  fonts: string[];
  plugins: string[];
  maxTouchPoints?: number;
  timezoneId?: string;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  presetVersion?: string;
  corpusTemplateId?: string | null;
  validation?: {
    score: number;
    issues: string[];
  };
}

export class AiFingerprintService {
  private static corpusCache: any[] | null = null;

  private static seededIndex(seed: string, salt: string, max: number) {
    const digest = crypto.createHash('sha256').update(`${seed}:${salt}`).digest('hex');
    return parseInt(digest.slice(0, 8), 16) % max;
  }

  private static seededPick<T>(seed: string, salt: string, values: T[]): T {
    return values[this.seededIndex(seed, salt, values.length)];
  }

  private static seededFloat(seed: string, salt: string, min: number, max: number) {
    const digest = crypto.createHash('sha256').update(`${seed}:${salt}`).digest('hex');
    const base = parseInt(digest.slice(0, 8), 16) / 0xffffffff;
    return min + (max - min) * base;
  }

  private static loadCorpus() {
    if (this.corpusCache) return this.corpusCache;

    try {
      const candidates = [
        path.resolve(__dirname, '../utils/profileTemplates.json'),
        path.resolve(process.cwd(), 'src/utils/profileTemplates.json'),
      ];
      const corpusPath = candidates.find((candidate) => fs.existsSync(candidate));
      if (!corpusPath) {
        throw new Error(`profileTemplates.json not found in ${candidates.join(', ')}`);
      }
      const raw = fs.readFileSync(corpusPath, 'utf8');
      this.corpusCache = JSON.parse(raw);
    } catch (error: any) {
      logger.warn('Fingerprint corpus unavailable, falling back to heuristic pools', { error: error?.message });
      this.corpusCache = [];
    }

    return this.corpusCache;
  }

  private static selectCorpusTemplate(platform: string, seed: string) {
    const corpus = this.loadCorpus();
    if (!corpus.length) return null;

    const normalizedPlatform = (platform || 'OTHER').toLowerCase();
    const filtered = corpus.filter((template: any) => {
      const name = `${template.name || ''} ${template.id || ''}`.toLowerCase();
      if (normalizedPlatform.includes('mobile')) return name.includes('mobile') || name.includes('android');
      if (normalizedPlatform.includes('mac')) return name.includes('mac');
      if (normalizedPlatform.includes('windows') || normalizedPlatform.includes('desktop')) return name.includes('windows');
      return true;
    });

    const pool = filtered.length ? filtered : corpus;
    return pool[this.seededIndex(seed, 'corpus-template', pool.length)];
  }

  static validateFingerprintConsistency(fingerprint: Partial<FingerprintParams>) {
    const issues: string[] = [];
    const ua = (fingerprint.userAgent || '').toLowerCase();
    const os = (fingerprint.platformOS || '').toLowerCase();
    const isMobile = Boolean(fingerprint.isMobile);
    const scale = Number(fingerprint.deviceScaleFactor || 1);
    const timezone = (fingerprint.timezoneId || '').toLowerCase();
    const lang = (fingerprint.language || '').toLowerCase();
    const [width, height] = (fingerprint.screenResolution || '0x0')
      .split('x')
      .map((item) => Number(item) || 0);

    if (isMobile && !/mobile|iphone|android/.test(ua)) {
      issues.push('Mobile fingerprint without mobile user agent.');
    }
    if (!isMobile && /mobile|iphone|android/.test(ua) && !/quest/.test(ua)) {
      issues.push('Desktop fingerprint paired with mobile user agent.');
    }
    if (os.includes('windows') && /macintosh|iphone/.test(ua)) {
      issues.push('Windows OS conflicts with Apple user agent.');
    }
    if (os.includes('mac') && /windows nt/.test(ua)) {
      issues.push('macOS OS conflicts with Windows user agent.');
    }
    if (isMobile && width > 1600) {
      issues.push('Mobile fingerprint uses unusually large screen width.');
    }
    if (!isMobile && width > 0 && width < 1000) {
      issues.push('Desktop fingerprint uses unusually small screen width.');
    }
    if (!isMobile && scale > 2) {
      issues.push('Desktop fingerprint uses aggressive device scale factor.');
    }
    if (lang.startsWith('es') && timezone.startsWith('america/new_york')) {
      issues.push('Language and timezone pairing is uncommon for the selected preset.');
    }
    if (!timezone) {
      issues.push('Fingerprint missing timezone.');
    }
    if (height > 0 && width > 0 && height > width * 2.5 && !isMobile) {
      issues.push('Desktop aspect ratio is too tall.');
    }

    const score = Math.max(0, 100 - issues.length * 18);
    return { score, issues };
  }

  /**
   * Generates a realistic fingerprint based on a target platform.
   * In a real enterprise V2, this would consume ML models or a large dataset.
   * For this implementation, we use a robust heuristic generator with realistic pools.
   */
  static generate(platform: string = 'OTHER', seed: string = 'global'): FingerprintParams {
    logger.info('Generating AI fingerprint', { platform, seed });
    const seedKey = `${platform}:${seed}`;
    const corpusTemplate = this.selectCorpusTemplate(platform, seedKey);

    let os = 'Windows';
    let arch = 'Win64; x64';
    let ua = '';
    let res = '1920x1080';
    let cores = 8;
    let memory = 16;

    if (platform === 'VISION_PRO') {
      os = 'visionOS';
      arch = 'Macintosh; Intel Mac OS X 10_15_7'; // visionOS reports as Mac for some APIs but UA is distinct
      ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
      res = '3660x3200';
      cores = 8;
      memory = 16;
    } else if (platform === 'OCULUS') {
      os = 'Android';
      arch = 'Linux; Android 12; Quest 3';
      ua = 'Mozilla/5.0 (Linux; Android 12; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/31.0.0.14.106 SamsungBrowser/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36';
      res = '2064x2208';
      cores = 8;
      memory = 8;
    } else if (platform === 'MOBILE') {
      const isiOS = this.seededPick(seedKey, 'mobile-os', [true, false]);
      if (isiOS) {
        os = 'iOS';
        arch = 'iPhone; CPU iPhone OS 17_0 like Mac OS X';
        ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
        res = '390x844';
        cores = 6;
        memory = 6;
      } else {
        os = 'Android';
        arch = 'Linux; Android 14; Pixel 8';
        ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36';
        res = '1080x2400';
        cores = 8;
        memory = 8;
      }
    } else {
      const osFlavor = this.seededPick(seedKey, 'osFlavor', ['windows', 'windows', 'mac', 'linux']);
      const isWindows = osFlavor === 'windows';
      const isMac = osFlavor === 'mac';
      os = isWindows ? 'Windows' : isMac ? 'macOS' : 'Linux';
      arch = isWindows ? 'Win64; x64' : isMac ? 'Intel Mac OS X 10_15_7' : 'X11; Linux x86_64';
      
      const userAgents = [
        `Mozilla/5.0 (${arch}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`,
        `Mozilla/5.0 (${arch}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36`,
        `Mozilla/5.0 (${arch}; rv:109.0) Gecko/20100101 Firefox/121.0`,
      ];
      ua = this.seededPick(seedKey, 'ua', userAgents);

      const resolutions = ['1920x1080', '1366x768', '1440x900', '1536x864', '2560x1440'];
      res = this.seededPick(seedKey, 'resolution', resolutions);
      cores = this.seededPick(seedKey, 'cores', [4, 8, 12, 16]);
      memory = this.seededPick(seedKey, 'memory', [8, 16, 32]);
    }

    const languages = ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR'];
    const fontsPool = ['Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Trebuchet MS'];
    const pluginsPool = ['PDF Viewer', 'Chrome PDF Viewer', 'Chromium PDF Viewer'];

    const canvasNoise = {
      r: this.seededPick(seedKey, 'canvas-r', [-2, -1, 0, 1, 2]),
      g: this.seededPick(seedKey, 'canvas-g', [-2, -1, 0, 1, 2]),
      b: this.seededPick(seedKey, 'canvas-b', [-2, -1, 0, 1, 2]),
      a: this.seededPick(seedKey, 'canvas-a', [-2, -1, 0, 1, 2]),
    };

    const webglVendors = ['Google Inc. (Intel)', 'Google Inc. (NVIDIA)', 'Google Inc. (AMD)'];
    const webglRenderers = [
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (AMD, Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0)'
    ];
    const vendorIdx = this.seededIndex(seedKey, 'webgl-vendor', webglVendors.length);

    const systemArch = ArchService.getSystemArch();
    const effectiveArch = (systemArch === 'arm64' && this.seededPick(seedKey, 'arch-bias', [true, true, true, false])) ? 'arm64' : 'x64';

    const generated: FingerprintParams = {
      platform,
      userAgent: corpusTemplate?.userAgent || ua,
      screenResolution: corpusTemplate?.screenRes ? `${corpusTemplate.screenRes[0]}x${corpusTemplate.screenRes[1]}` : res,
      language: corpusTemplate?.locale || this.seededPick(seedKey, 'language', languages),
      platformOS: os,
      hardwareConcurrency: corpusTemplate?.hardwareConcurrency || cores,
      deviceMemory: corpusTemplate?.deviceMemory || memory,
      arch: effectiveArch,
      canvas: { noise: canvasNoise },
      webgl: {
        vendor: corpusTemplate?.webglVendor || (platform === 'VISION_PRO' ? 'Apple Inc.' : platform === 'OCULUS' ? 'Qualcomm' : webglVendors[vendorIdx]),
        renderer: corpusTemplate?.webglRenderer || (platform === 'VISION_PRO' ? 'Apple Software Renderer' : platform === 'OCULUS' ? 'Adreno (TM) 740' : webglRenderers[vendorIdx]),
        unmaskedVendor: corpusTemplate?.webglVendor || (platform === 'VISION_PRO' ? 'Apple Inc.' : platform === 'OCULUS' ? 'Qualcomm' : webglVendors[vendorIdx]),
        unmaskedRenderer: corpusTemplate?.webglRenderer || (platform === 'VISION_PRO' ? 'Apple Software Renderer' : platform === 'OCULUS' ? 'Adreno (TM) 740' : webglRenderers[vendorIdx]),
      },
      audio: {
        sampleRate: 44100,
        noise: this.seededFloat(seedKey, 'audio-noise', 0, 0.0000001),
      },
      fonts: corpusTemplate?.fonts || [...fontsPool].sort((a, b) => this.seededIndex(seedKey, `${a}-${b}`, 3) - 1).slice(0, 6),
      plugins: [...pluginsPool].sort((a, b) => this.seededIndex(seedKey, `${a}-${b}`, 3) - 1).slice(0, 3),
      maxTouchPoints: (platform === 'MOBILE' || platform === 'OCULUS' || platform === 'VISION_PRO') ? 5 : 0,
      timezoneId: corpusTemplate?.timezone || this.seededPick(seedKey, 'timezone', ['Europe/Madrid', 'Europe/Paris', 'America/New_York', 'America/Chicago']),
      deviceScaleFactor: this.seededPick(seedKey, 'scale', [1, 1, 1.25, 1.5]),
      isMobile: platform === 'MOBILE' || platform === 'OCULUS',
      presetVersion: 'corpus-v2',
      corpusTemplateId: corpusTemplate?.id || null,
    };

    const hardened = FingerprintHardeningService.harden(generated);
    const finalFingerprint = hardened.fingerprint;
    finalFingerprint.validation = this.validateFingerprintConsistency(finalFingerprint);
    return finalFingerprint;
  }
}

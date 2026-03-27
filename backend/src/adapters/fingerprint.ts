import crypto from 'crypto';

// Common user agents — rotated for variety
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

const WEBGL_VENDORS = [
  'Google Inc. (NVIDIA)',
  'Google Inc. (Intel)',
  'Google Inc. (AMD)',
  'Google Inc. (Apple)',
];

const WEBGL_RENDERERS = [
  'ANGLE (NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (AMD Radeon RX 5700 XT Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)',
];

const PLATFORMS = ['Win32', 'MacIntel', 'Linux x86_64'];

const SCREEN_RESOLUTIONS = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 3840, height: 2160 },
  { width: 1536, height: 864 },
];

const FONT_SETS = [
  ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Comic Sans MS'],
  ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Impact', 'Trebuchet MS'],
  ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Lucida Console', 'Tahoma', 'Palatino'],
];

/**
 * Pick a deterministic-but-random item from an array using a seed.
 */
function seededPick<T>(arr: T[], seed: string, offset = 0): T {
  const hash = crypto.createHash('md5').update(seed + offset).digest();
  const idx = hash.readUInt32BE(0) % arr.length;
  return arr[idx];
}

function seededInt(min: number, max: number, seed: string, offset = 0): number {
  const hash = crypto.createHash('md5').update(seed + offset).digest();
  return min + (hash.readUInt32BE(0) % (max - min + 1));
}

/**
 * Generate a consistent fingerprint for a profile.
 * The fingerprint is deterministic based on profileId — same profileId always
 * generates the same fingerprint, so it remains consistent across sessions.
 */
export function generateFingerprint(profileId: string): Record<string, any> {
  const screen = seededPick(SCREEN_RESOLUTIONS, profileId, 1);

  return {
    userAgent: seededPick(USER_AGENTS, profileId, 10),
    platform: seededPick(PLATFORMS, profileId, 20),
    hardwareConcurrency: seededPick([2, 4, 8, 12, 16], profileId, 30),
    deviceMemory: seededPick([2, 4, 8, 16], profileId, 40),
    maxTouchPoints: 0,
    screenWidth: screen.width,
    screenHeight: screen.height,
    canvasNoise: seededInt(1, 255, profileId, 50),
    webglVendor: seededPick(WEBGL_VENDORS, profileId, 60),
    webglRenderer: seededPick(WEBGL_RENDERERS, profileId, 70),
    fonts: seededPick(FONT_SETS, profileId, 80),
    plugins: seededPick([3, 4, 5], profileId, 90),
    audioContextHash: crypto.createHash('sha256').update(profileId + 'audio').digest('hex').substring(0, 16),
  };
}

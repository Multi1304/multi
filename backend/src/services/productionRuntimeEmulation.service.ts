import { prisma } from '../prisma';

export interface ProductionRuntimeEmulationSettings {
  enabled: boolean;
  allowedHosts: string[];
  emulateWebRTC: boolean;
  emulateAudio: boolean;
  emulateBattery: boolean;
  maskLocalIps: boolean;
}

const DEFAULT_SETTINGS: ProductionRuntimeEmulationSettings = {
  enabled: true,
  allowedHosts: ['localhost', '127.0.0.1'],
  emulateWebRTC: true,
  emulateAudio: true,
  emulateBattery: true,
  maskLocalIps: true,
};

export class ProductionRuntimeEmulationService {
  static normalize(settings?: any): ProductionRuntimeEmulationSettings {
    const raw = settings?.productionRuntimeEmulation || {};
    const allowedHosts = Array.isArray(raw.allowedHosts)
      ? raw.allowedHosts.map((item: any) => String(item).trim()).filter(Boolean)
      : DEFAULT_SETTINGS.allowedHosts;

    return {
      enabled: raw.enabled !== false,
      allowedHosts: allowedHosts.length ? allowedHosts : DEFAULT_SETTINGS.allowedHosts,
      emulateWebRTC: raw.emulateWebRTC !== false,
      emulateAudio: raw.emulateAudio !== false,
      emulateBattery: raw.emulateBattery !== false,
      maskLocalIps: raw.maskLocalIps !== false,
    };
  }

  static async getSettings(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    return this.normalize(tenant.settings);
  }

  static buildPayload(settings: ProductionRuntimeEmulationSettings, fingerprint?: any) {
    return {
      enabled: settings.enabled,
      allowedHosts: settings.allowedHosts,
      emulateWebRTC: settings.emulateWebRTC,
      emulateAudio: settings.emulateAudio,
      emulateBattery: settings.emulateBattery,
      maskLocalIps: settings.maskLocalIps,
      batterySeed: `${fingerprint?.userAgent || 'ua'}:${fingerprint?.timezoneId || 'tz'}`,
      audioNoise: fingerprint?.audio?.noise || 0.0000001,
    };
  }
}

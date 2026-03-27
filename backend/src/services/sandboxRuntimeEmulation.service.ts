import { prisma } from '../prisma';

export interface SandboxRuntimeEmulationSettings {
  enabled: boolean;
  allowedHosts: string[];
  dynamicCanvasEvolution: boolean;
  emulateWebRTC: boolean;
  emulateAudio: boolean;
  emulateBattery: boolean;
  intervalMinMinutes: number;
  intervalMaxMinutes: number;
}

const DEFAULT_SETTINGS: SandboxRuntimeEmulationSettings = {
  enabled: true,
  allowedHosts: ['localhost', '127.0.0.1'],
  dynamicCanvasEvolution: true,
  emulateWebRTC: true,
  emulateAudio: true,
  emulateBattery: true,
  intervalMinMinutes: 3,
  intervalMaxMinutes: 8,
};

export class SandboxRuntimeEmulationService {
  static normalize(settings?: any): SandboxRuntimeEmulationSettings {
    const raw = settings?.sandboxRuntimeEmulation || {};
    const allowedHosts = Array.isArray(raw.allowedHosts)
      ? raw.allowedHosts.map((item: any) => String(item).trim()).filter(Boolean)
      : DEFAULT_SETTINGS.allowedHosts;
    return {
      enabled: raw.enabled !== false,
      allowedHosts: allowedHosts.length ? allowedHosts : DEFAULT_SETTINGS.allowedHosts,
      dynamicCanvasEvolution: raw.dynamicCanvasEvolution !== false,
      emulateWebRTC: raw.emulateWebRTC !== false,
      emulateAudio: raw.emulateAudio !== false,
      emulateBattery: raw.emulateBattery !== false,
      intervalMinMinutes: Math.max(1, Number(raw.intervalMinMinutes || DEFAULT_SETTINGS.intervalMinMinutes)),
      intervalMaxMinutes: Math.max(
        Math.max(1, Number(raw.intervalMinMinutes || DEFAULT_SETTINGS.intervalMinMinutes)),
        Number(raw.intervalMaxMinutes || DEFAULT_SETTINGS.intervalMaxMinutes)
      ),
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

  static async updateSettings(tenantId: string, partial: Partial<SandboxRuntimeEmulationSettings>) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const current = this.normalize(tenant.settings);
    const next = this.normalize({
      sandboxRuntimeEmulation: {
        ...current,
        ...partial,
        allowedHosts: Array.isArray(partial.allowedHosts) ? partial.allowedHosts : current.allowedHosts,
      }
    });

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...((tenant.settings as any) || {}),
          sandboxRuntimeEmulation: next,
        } as any,
      },
    });

    return next;
  }

  static buildPayload(settings: SandboxRuntimeEmulationSettings, fingerprint?: any) {
    return {
      enabled: settings.enabled,
      allowedHosts: settings.allowedHosts,
      dynamicCanvasEvolution: settings.dynamicCanvasEvolution,
      emulateWebRTC: settings.emulateWebRTC,
      emulateAudio: settings.emulateAudio,
      emulateBattery: settings.emulateBattery,
      intervalMinMinutes: settings.intervalMinMinutes,
      intervalMaxMinutes: settings.intervalMaxMinutes,
      canvasNoise: fingerprint?.canvas?.noise || null,
      webglVendor: fingerprint?.webgl?.vendor || null,
      webglRenderer: fingerprint?.webgl?.renderer || null,
      audioNoise: fingerprint?.audio?.noise || 0,
      batterySeed: `${fingerprint?.userAgent || 'ua'}:${fingerprint?.timezoneId || 'tz'}`,
    };
  }
}

import { prisma } from '../prisma';

export type RuntimeEnvironmentMode = 'sandbox' | 'production';

export class RuntimeEnvironmentService {
  static async resolve(params: {
    tenantId?: string | null;
    fingerprint?: any;
    explicitMode?: RuntimeEnvironmentMode | string | null;
  }): Promise<RuntimeEnvironmentMode> {
    const explicit = this.normalizeMode(params.explicitMode || params.fingerprint?.runtimeEnvironment || params.fingerprint?.environment);
    if (explicit) return explicit;

    const productionModeFlag = params.fingerprint?.productionMode;
    if (productionModeFlag === false) return 'sandbox';
    if (productionModeFlag === true) return 'production';

    if (params.tenantId) {
      const tenant = await (prisma as any).tenant?.findUnique?.({
        where: { id: params.tenantId },
        select: { settings: true },
      })?.catch?.(() => null);
      const tenantMode = this.normalizeMode((tenant?.settings as any)?.runtimeEnvironment?.mode);
      if (tenantMode) return tenantMode;
    }

    return this.defaultMode();
  }

  static defaultMode(): RuntimeEnvironmentMode {
    return this.normalizeMode(process.env.CAMEL_RUNTIME_ENVIRONMENT) || 'production';
  }

  static normalizeMode(value?: string | null): RuntimeEnvironmentMode | null {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'sandbox') return 'sandbox';
    if (normalized === 'production') return 'production';
    return null;
  }
}

import { describe, expect, it } from 'vitest';
import { NetworkMetadataCatalogService } from '../src/services/networkMetadataCatalog.service';

describe('NetworkMetadataCatalogService', () => {
  it('exposes practical geo coverage and self-hosted VPN metadata blueprints', () => {
    const catalog = NetworkMetadataCatalogService.getCatalog();

    expect(catalog.countries.some((item) => item.country === 'ES')).toBe(true);
    expect(catalog.countries.some((item) => item.country === 'US')).toBe(true);
    expect(catalog.providers.some((item) => item.id === 'self-hosted-wireguard')).toBe(true);
    expect(catalog.vpnBlueprints[0]?.provider).toBe('SELF_HOSTED');
  });
});

type GeoCatalogEntry = {
  country: string;
  label: string;
  region: string;
  cities: string[];
  tags: string[];
};

type ProviderCatalogEntry = {
  id: string;
  label: string;
  endpointType: 'RESIDENTIAL' | 'MOBILE' | 'DATACENTER' | 'VPN';
  operatorModel: 'managed' | 'self_hosted';
  stickyFriendly: boolean;
  notes: string[];
};

type PlatformRoutingProfile = {
  key: string;
  label: string;
  platform: string;
  preferredEndpointTypes: string[];
  fallbackEndpointTypes: string[];
  stickyRecommended: boolean;
  geoSensitivity: 'low' | 'medium' | 'high';
  notes: string[];
};

export class NetworkMetadataCatalogService {
  private static readonly GEO_CATALOG: GeoCatalogEntry[] = [
    { country: 'ES', label: 'Spain', region: 'EU-WEST', cities: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla'], tags: ['eu', 'payments', 'social'] },
    { country: 'FR', label: 'France', region: 'EU-WEST', cities: ['Paris', 'Lyon', 'Marseille'], tags: ['eu', 'retail', 'social'] },
    { country: 'DE', label: 'Germany', region: 'EU-CENTRAL', cities: ['Berlin', 'Frankfurt', 'Munich'], tags: ['eu', 'enterprise', 'finance'] },
    { country: 'IT', label: 'Italy', region: 'EU-SOUTH', cities: ['Milan', 'Rome', 'Naples'], tags: ['eu', 'retail', 'social'] },
    { country: 'NL', label: 'Netherlands', region: 'EU-WEST', cities: ['Amsterdam', 'Rotterdam'], tags: ['eu', 'datacenter', 'saas'] },
    { country: 'GB', label: 'United Kingdom', region: 'EU-WEST', cities: ['London', 'Manchester', 'Birmingham'], tags: ['eu', 'finance', 'ads'] },
    { country: 'US', label: 'United States', region: 'US', cities: ['New York', 'Ashburn', 'Los Angeles', 'Chicago', 'Dallas', 'Miami'], tags: ['global', 'ads', 'cloud'] },
    { country: 'CA', label: 'Canada', region: 'US', cities: ['Toronto', 'Montreal', 'Vancouver'], tags: ['north_america', 'retail'] },
    { country: 'MX', label: 'Mexico', region: 'LATAM', cities: ['Mexico City', 'Monterrey', 'Guadalajara'], tags: ['latam', 'social'] },
    { country: 'BR', label: 'Brazil', region: 'LATAM', cities: ['Sao Paulo', 'Rio de Janeiro', 'Curitiba'], tags: ['latam', 'social', 'mobile'] },
    { country: 'AR', label: 'Argentina', region: 'LATAM', cities: ['Buenos Aires', 'Cordoba'], tags: ['latam', 'social'] },
    { country: 'CO', label: 'Colombia', region: 'LATAM', cities: ['Bogota', 'Medellin'], tags: ['latam', 'mobile'] },
    { country: 'JP', label: 'Japan', region: 'APAC', cities: ['Tokyo', 'Osaka'], tags: ['apac', 'gaming', 'mobile'] },
    { country: 'KR', label: 'South Korea', region: 'APAC', cities: ['Seoul', 'Busan'], tags: ['apac', 'gaming', 'mobile'] },
    { country: 'SG', label: 'Singapore', region: 'APAC', cities: ['Singapore'], tags: ['apac', 'regional_hub'] },
    { country: 'HK', label: 'Hong Kong', region: 'APAC', cities: ['Hong Kong'], tags: ['apac', 'finance'] },
    { country: 'IN', label: 'India', region: 'APAC', cities: ['Mumbai', 'Delhi', 'Bangalore'], tags: ['apac', 'mobile', 'scale'] },
    { country: 'AE', label: 'United Arab Emirates', region: 'MEA', cities: ['Dubai', 'Abu Dhabi'], tags: ['mea', 'luxury', 'finance'] },
    { country: 'TR', label: 'Turkey', region: 'MEA', cities: ['Istanbul', 'Ankara'], tags: ['mea', 'social'] },
    { country: 'AU', label: 'Australia', region: 'APAC', cities: ['Sydney', 'Melbourne'], tags: ['apac', 'retail'] },
  ];

  private static readonly PROVIDER_CATALOG: ProviderCatalogEntry[] = [
    {
      id: 'managed-residential',
      label: 'Managed Residential',
      endpointType: 'RESIDENTIAL',
      operatorModel: 'managed',
      stickyFriendly: true,
      notes: ['Best default for broad geo coverage.', 'Good fit for desktop web, retail and account longevity.'],
    },
    {
      id: 'managed-mobile',
      label: 'Managed Mobile',
      endpointType: 'MOBILE',
      operatorModel: 'managed',
      stickyFriendly: true,
      notes: ['Best fit for mobile-social workloads.', 'Useful where carrier metadata matters.'],
    },
    {
      id: 'managed-datacenter',
      label: 'Managed Datacenter',
      endpointType: 'DATACENTER',
      operatorModel: 'managed',
      stickyFriendly: false,
      notes: ['Best for speed and internal automation.', 'Use where residential realism is less important.'],
    },
    {
      id: 'self-hosted-wireguard',
      label: 'Self-hosted WireGuard VPN',
      endpointType: 'VPN',
      operatorModel: 'self_hosted',
      stickyFriendly: true,
      notes: ['Tag endpoints as VPN and provider SELF_HOSTED.', 'Good for predictable exits and city-specific offices or POPs.'],
    },
    {
      id: 'self-hosted-openvpn',
      label: 'Self-hosted OpenVPN Exit',
      endpointType: 'VPN',
      operatorModel: 'self_hosted',
      stickyFriendly: true,
      notes: ['Prefer when you already operate your own VPN gateways.', 'Works well with sticky-by-profile routing.'],
    },
  ];

  private static readonly PLATFORM_PROFILES: PlatformRoutingProfile[] = [
    {
      key: 'instagram',
      label: 'Instagram / Mobile Social',
      platform: 'INSTAGRAM',
      preferredEndpointTypes: ['MOBILE', 'RESIDENTIAL'],
      fallbackEndpointTypes: ['VPN'],
      stickyRecommended: true,
      geoSensitivity: 'high',
      notes: ['Prefer carrier-tagged mobile exits when available.', 'Keep sticky routing enabled for profile continuity.'],
    },
    {
      key: 'tiktok',
      label: 'TikTok / Mobile Social',
      platform: 'TIKTOK',
      preferredEndpointTypes: ['MOBILE', 'RESIDENTIAL'],
      fallbackEndpointTypes: ['VPN'],
      stickyRecommended: true,
      geoSensitivity: 'high',
      notes: ['Use city-aligned exits where campaigns are local.', 'Avoid datacenter-first routing for this profile.'],
    },
    {
      key: 'facebook',
      label: 'Facebook / Social',
      platform: 'FACEBOOK',
      preferredEndpointTypes: ['RESIDENTIAL', 'MOBILE'],
      fallbackEndpointTypes: ['VPN'],
      stickyRecommended: true,
      geoSensitivity: 'medium',
      notes: ['Residential is usually the safest general-purpose default.', 'Sticky routing helps account continuity.'],
    },
    {
      key: 'google',
      label: 'Google / Workspace',
      platform: 'GOOGLE',
      preferredEndpointTypes: ['RESIDENTIAL', 'DATACENTER'],
      fallbackEndpointTypes: ['VPN'],
      stickyRecommended: true,
      geoSensitivity: 'high',
      notes: ['Use geo-consistent exits for workspace and productivity flows.', 'Prefer stable low-latency endpoints.'],
    },
    {
      key: 'amazon',
      label: 'Amazon / Retail',
      platform: 'AMAZON',
      preferredEndpointTypes: ['RESIDENTIAL', 'VPN'],
      fallbackEndpointTypes: ['DATACENTER'],
      stickyRecommended: true,
      geoSensitivity: 'high',
      notes: ['Country and city metadata matter for local storefronts.', 'Self-hosted VPN can be valid if exit locations are explicit and stable.'],
    },
    {
      key: 'desktop',
      label: 'Desktop / Web Automation',
      platform: 'DESKTOP',
      preferredEndpointTypes: ['RESIDENTIAL', 'DATACENTER'],
      fallbackEndpointTypes: ['VPN'],
      stickyRecommended: false,
      geoSensitivity: 'medium',
      notes: ['Use datacenter only when realism is less important than speed.', 'Residential remains the general-purpose default.'],
    },
  ];

  static getCatalog() {
    return {
      countries: this.GEO_CATALOG,
      providers: this.PROVIDER_CATALOG,
      platformProfiles: this.PLATFORM_PROFILES,
      endpointTypes: ['RESIDENTIAL', 'MOBILE', 'DATACENTER', 'VPN'],
      vpnBlueprints: [
        {
          id: 'wireguard-self-hosted',
          label: 'WireGuard self-hosted exits',
          provider: 'SELF_HOSTED',
          endpointType: 'VPN',
          stickyRecommended: true,
          requiredMetadata: ['country', 'city', 'provider', 'metadata.exitNode', 'metadata.region'],
          notes: [
            'Use one endpoint record per exit node.',
            'Populate country and city explicitly so geo targeting and failover stay meaningful.',
            'Mark provider as SELF_HOSTED and endpointType as VPN.',
          ],
        },
        {
          id: 'wireguard-multi-exit-cluster',
          label: 'WireGuard multi-exit cluster',
          provider: 'SELF_HOSTED',
          endpointType: 'VPN',
          stickyRecommended: true,
          requiredMetadata: ['country', 'city', 'provider', 'metadata.exitNode', 'metadata.region', 'metadata.cluster'],
          notes: [
            'Use several exit nodes instead of one shared gateway when multiple seats need separation.',
            'Treat each exit node as its own endpoint so Camel can fail over and keep stickies cleanly.',
            'Good middle ground when you want to reduce dependence on commercial pools without pretending one VPN exit equals many identities.',
          ],
        },
      ],
    };
  }

  static getPlatformProfile(platform?: string | null) {
    const normalized = String(platform || '').trim().toUpperCase();
    return this.PLATFORM_PROFILES.find((item) => item.platform === normalized)
      || this.PLATFORM_PROFILES.find((item) => item.key === String(platform || '').trim().toLowerCase())
      || this.PLATFORM_PROFILES.find((item) => item.key === 'desktop')!;
  }

  static getCitiesForCountry(country?: string | null) {
    if (!country) return [];
    const match = this.GEO_CATALOG.find((entry) => entry.country.toUpperCase() === String(country).trim().toUpperCase());
    return match?.cities || [];
  }
}

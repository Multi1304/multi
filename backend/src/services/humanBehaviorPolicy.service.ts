import { config } from '../config';
import { ScaleMetricsService } from './scaleMetrics.service';
import { RuntimeEnvironmentMode, RuntimeEnvironmentService } from './runtimeEnvironment.service';

type HumanPolicyName = 'conservative' | 'balanced' | 'expressive';
type HumanProfileName = 'focused_operator' | 'patient_reader' | 'fast_scanner';

interface HumanPolicy {
  keypressMin: number;
  keypressMax: number;
  settleMin: number;
  settleMax: number;
  mouseStepsMin: number;
  mouseStepsMax: number;
  jitterPauseMin: number;
  jitterPauseMax: number;
}

export interface HumanBehaviorContext {
  tenantId?: string | null;
  profileId?: string | null;
  sessionKey?: string | null;
  preferredProfile?: HumanProfileName | null;
  environment?: RuntimeEnvironmentMode;
}

interface HumanBehaviorAdapter {
  nextKeypressDelay(context?: HumanBehaviorContext): Promise<number>;
  nextSettleDelay(context?: HumanBehaviorContext): Promise<number>;
  nextMouseSteps(context?: HumanBehaviorContext): Promise<number>;
  nextJitterPause(context?: HumanBehaviorContext): Promise<number>;
  nextScrollSteps(context?: HumanBehaviorContext): Promise<number>;
}

const POLICIES: Record<HumanPolicyName, HumanPolicy> = {
  conservative: {
    keypressMin: 45,
    keypressMax: 85,
    settleMin: 250,
    settleMax: 500,
    mouseStepsMin: 8,
    mouseStepsMax: 14,
    jitterPauseMin: 80,
    jitterPauseMax: 160,
  },
  balanced: {
    keypressMin: 55,
    keypressMax: 110,
    settleMin: 350,
    settleMax: 700,
    mouseStepsMin: 12,
    mouseStepsMax: 20,
    jitterPauseMin: 100,
    jitterPauseMax: 220,
  },
  expressive: {
    keypressMin: 70,
    keypressMax: 140,
    settleMin: 450,
    settleMax: 900,
    mouseStepsMin: 16,
    mouseStepsMax: 24,
    jitterPauseMin: 120,
    jitterPauseMax: 280,
  },
};

const RECORDED_BEHAVIOR_LIBRARY: Record<HumanProfileName, {
  keypress: number[];
  settle: number[];
  mouseSteps: number[];
  jitter: number[];
  scrollSteps: number[]; // Added scroll steps
}> = {
  focused_operator: {
    keypress: [58, 63, 67, 72, 75, 69, 61, 64, 70, 66],
    settle: [320, 410, 380, 460, 430, 350, 390, 420],
    mouseSteps: [11, 12, 14, 13, 15, 12, 16, 14],
    jitter: [96, 110, 118, 104, 122, 115],
    scrollSteps: [3, 5, 4, 6, 5],
  },
  patient_reader: {
    keypress: [75, 82, 88, 94, 101, 86, 92, 98],
    settle: [520, 640, 590, 710, 680, 560, 620, 690],
    mouseSteps: [14, 16, 17, 15, 18, 16, 19],
    jitter: [138, 152, 166, 149, 171, 160],
    scrollSteps: [8, 12, 10, 15, 11],
  },
  fast_scanner: {
    keypress: [44, 49, 53, 57, 61, 55, 50, 59],
    settle: [210, 260, 240, 290, 275, 230, 250, 280],
    mouseSteps: [8, 9, 11, 10, 9, 12, 10],
    jitter: [70, 84, 91, 77, 88, 82],
    scrollSteps: [20, 35, 25, 40, 30],
  },
};

class SandboxHumanBehaviorAdapter implements HumanBehaviorAdapter {
  async nextKeypressDelay() {
    const policy = HumanBehaviorPolicyService.getPolicy();
    const value = HumanBehaviorPolicyService.randomBetween(policy.keypressMin, policy.keypressMax);
    await ScaleMetricsService.observeDuration('human_behavior:keypress_delay', value);
    return value;
  }

  async nextSettleDelay() {
    const policy = HumanBehaviorPolicyService.getPolicy();
    const value = HumanBehaviorPolicyService.randomBetween(policy.settleMin, policy.settleMax);
    await ScaleMetricsService.observeDuration('human_behavior:settle_delay', value);
    return value;
  }

  async nextMouseSteps() {
    const policy = HumanBehaviorPolicyService.getPolicy();
    const value = HumanBehaviorPolicyService.randomBetween(policy.mouseStepsMin, policy.mouseStepsMax);
    await ScaleMetricsService.setGauge('human_behavior:mouse_steps_last', value);
    return value;
  }

  async nextJitterPause() {
    const policy = HumanBehaviorPolicyService.getPolicy();
    const value = HumanBehaviorPolicyService.randomBetween(policy.jitterPauseMin, policy.jitterPauseMax);
    await ScaleMetricsService.observeDuration('human_behavior:jitter_pause', value);
    return value;
  }

  async nextScrollSteps() {
    return HumanBehaviorPolicyService.randomBetween(3, 15);
  }
}

class ProductionHumanBehaviorAdapter implements HumanBehaviorAdapter {
  async nextKeypressDelay(context?: HumanBehaviorContext) {
    return sampleSeries('keypress', context);
  }

  async nextSettleDelay(context?: HumanBehaviorContext) {
    return sampleSeries('settle', context);
  }

  async nextMouseSteps(context?: HumanBehaviorContext) {
    const value = await sampleSeries('mouseSteps', context);
    await ScaleMetricsService.setGauge('human_behavior:mouse_steps_last', value);
    return value;
  }

  async nextJitterPause(context?: HumanBehaviorContext) {
    return sampleSeries('jitter', context);
  }

  async nextScrollSteps(context?: HumanBehaviorContext) {
    return sampleSeries('scrollSteps', context);
  }
}

const sandboxAdapter = new SandboxHumanBehaviorAdapter();
const productionAdapter = new ProductionHumanBehaviorAdapter();

export class HumanBehaviorPolicyService {
  static getPolicy(): HumanPolicy {
    const requested = (config.browserRuntime.humanPolicy || 'balanced') as HumanPolicyName;
    return POLICIES[requested] || POLICIES.balanced;
  }

  static randomBetween(min: number, max: number) {
    return Math.round(min + Math.random() * (max - min));
  }

  static async nextKeypressDelay(context?: HumanBehaviorContext) {
    const adapter = await resolveAdapter(context);
    return adapter.nextKeypressDelay(context);
  }

  static async nextSettleDelay(context?: HumanBehaviorContext) {
    const adapter = await resolveAdapter(context);
    return adapter.nextSettleDelay(context);
  }

  static async nextMouseSteps(context?: HumanBehaviorContext) {
    const adapter = await resolveAdapter(context);
    return adapter.nextMouseSteps(context);
  }

  static async nextJitterPause(context?: HumanBehaviorContext) {
    const adapter = await resolveAdapter(context);
    return adapter.nextJitterPause(context);
  }

  static async nextScrollSteps(context?: HumanBehaviorContext) {
    const adapter = await resolveAdapter(context);
    return adapter.nextScrollSteps(context);
  }
}

async function resolveAdapter(context?: HumanBehaviorContext) {
  const environment = await RuntimeEnvironmentService.resolve({
    tenantId: context?.tenantId,
    explicitMode: context?.environment,
  });
  return environment === 'sandbox' ? sandboxAdapter : productionAdapter;
}

function resolveRecordedProfile(context?: HumanBehaviorContext): HumanProfileName {
  const explicit = context?.preferredProfile;
  if (explicit && RECORDED_BEHAVIOR_LIBRARY[explicit]) return explicit;

  const source = `${context?.profileId || ''}:${context?.sessionKey || ''}`.trim();
  if (!source) return 'focused_operator';
  const profiles = Object.keys(RECORDED_BEHAVIOR_LIBRARY) as HumanProfileName[];
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return profiles[Math.abs(hash) % profiles.length];
}

async function sampleSeries(
  key: keyof typeof RECORDED_BEHAVIOR_LIBRARY.focused_operator,
  context?: HumanBehaviorContext
) {
  const profile = resolveRecordedProfile(context);
  const series = RECORDED_BEHAVIOR_LIBRARY[profile][key];
  const baseIndex = Math.floor(Math.random() * series.length);
  const variance = key === 'mouseSteps' ? 1 : 12;
  const value = Math.max(1, Math.round(series[baseIndex] + (Math.random() * variance * 2 - variance)));

  await ScaleMetricsService.observeDuration(`human_behavior:${key}`, value);
  await ScaleMetricsService.setGauge('human_behavior:profile_variant', (
    profile === 'focused_operator' ? 1 : profile === 'patient_reader' ? 2 : 3
  ));

  return value;
}

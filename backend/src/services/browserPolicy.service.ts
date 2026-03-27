import { config } from '../config';

export type BrowserStage = 'email' | 'password' | 'profile' | 'birth' | null;
export type ExpectedField = 'month' | 'day' | 'year' | 'country' | 'birth' | 'generic';

export class BrowserPolicyService {
  static isStrictRuntime() {
    return config.browserRuntime.strictMode;
  }

  static allowAutoHealingMutations() {
    return !this.isStrictRuntime() || config.browserRuntime.allowAutoHealingMutations;
  }

  static allowAggressiveClicks() {
    return !this.isStrictRuntime() || config.browserRuntime.allowAggressiveClicks;
  }

  static inferExpectedField(primarySelector: string): ExpectedField {
    const lowSel = (primarySelector || '').toLowerCase();
    if (lowSel.includes('country') || lowSel.includes('pais') || lowSel.includes('país') || lowSel.includes('region') || lowSel.includes('región')) return 'country';
    if (lowSel.includes('month') || lowSel.includes('mes')) return 'month';
    if (lowSel.includes('day') || lowSel.includes('dia') || lowSel.includes('día')) return 'day';
    if (lowSel.includes('year') || lowSel.includes('ano') || lowSel.includes('año')) return 'year';
    if (lowSel.includes('birth') || lowSel.includes('fecha') || lowSel.includes('nacimiento')) return 'birth';
    return 'generic';
  }

  static inferRequiredStage(selector: string): BrowserStage {
    const lowSel = (selector || '').toLowerCase();
    if (/member|loginfmt|i0117|type="email"|input\[type="email"\]|email/.test(lowSel)) return 'email';
    if (/password|passwd|i0118|type="password"/.test(lowSel)) return 'password';
    if (/firstname|lastname|first|last/.test(lowSel)) return 'profile';
    if (/birth|month|day|year|country|mes|dia|día|ano|año|pais|país/.test(lowSel)) return 'birth';
    return null;
  }

  static isMandatoryField(selector: string) {
    return this.inferRequiredStage(selector) !== null;
  }

  static allowedStagesFor(requiredStage: Exclude<BrowserStage, null>) {
    const allowedByStage: Record<Exclude<BrowserStage, null>, string[]> = {
      email: ['email', 'password', 'profile', 'birth', 'success'],
      password: ['password', 'profile', 'birth', 'success'],
      profile: ['profile', 'birth', 'success'],
      birth: ['birth', 'profile', 'success']
    };
    return allowedByStage[requiredStage] || [];
  }

  static isStageCompatible(requiredStage: BrowserStage, currentStage: string) {
    if (!requiredStage) return true;
    return this.allowedStagesFor(requiredStage).includes(currentStage);
  }

  static isAdvanceButton(selector: string) {
    const lowSel = (selector || '').toLowerCase();
    return /signupbutton|idsibutton9|type="submit"|button|next|siguiente|continue|continuar/.test(lowSel);
  }

  static nextButtonSelectors() {
    return '#SignupButton, #idSIButton9, button:has-text("Next"), button:has-text("Siguiente"), [type="submit"]';
  }
}

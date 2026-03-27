export class CaptchaRuntimePolicyService {
  private static isTruthy(value: string | undefined | null) {
    return /^(1|true|yes|on)$/i.test(String(value || '').trim());
  }

  static allowSandboxMockChallenges() {
    return String(process.env.CAMEL_ENABLE_SANDBOX_MOCK_CHALLENGES || 'true').toLowerCase() !== 'false';
  }

  static allowLocalVisionBridge() {
    return String(process.env.CAMEL_ENABLE_LOCAL_VISION_BRIDGE || 'true').toLowerCase() !== 'false';
  }

  static allowExternalChallengeAutomation() {
    return this.isTruthy(process.env.CAMEL_ENABLE_EXTERNAL_CHALLENGE_AUTOMATION);
  }

  static allowLocalVisionForExternalChallenge() {
    return this.allowLocalVisionBridge();
  }

  static allowThirdPartyCaptcha() {
    return this.allowExternalChallengeAutomation() && this.isTruthy(process.env.CAMEL_ENABLE_THIRD_PARTY_CAPTCHA);
  }

  static getHealthReport() {
    return {
      sandboxMockChallengesEnabled: this.allowSandboxMockChallenges(),
      localVisionBridgeEnabled: this.allowLocalVisionBridge(),
      externalChallengeAutomationEnabled: this.allowExternalChallengeAutomation(),
      thirdPartyCaptchaEnabled: this.allowThirdPartyCaptcha(),
    };
  }
}

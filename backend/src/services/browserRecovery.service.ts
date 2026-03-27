import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { BrowserPolicyService } from './browserPolicy.service';
import { BrowserStageService } from './browserStage.service';

export class BrowserRecoveryService {
  private static readonly PASSWORD_SYMBOLS = ['!', '@', '#', '$', '%', '&', '*'];

  private static async hasProfileSurface(page: Page) {
    return await page.evaluate(() => {
      const isVisible = (el: Element | null) => {
        if (!el) return false;
        const node = el as HTMLElement;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const withinViewport =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth;
        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0' &&
          node.offsetWidth > 0 &&
          node.offsetHeight > 0 &&
          withinViewport
        );
      };

      const selectors = [
        '#FirstName',
        '#LastName',
        '#firstNameInput',
        '#lastNameInput',
        'input[name="FirstName"]',
        'input[name="LastName"]',
        'input[name="firstNameInput"]',
        'input[name="lastNameInput"]',
        'input[placeholder*="Nombre"]',
        'input[placeholder*="Apellido"]',
        'input[aria-label*="Nombre"]',
        'input[aria-label*="Apellido"]',
        'input[aria-label*="First"]',
        'input[aria-label*="Last"]',
      ];

      if (selectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((el) => isVisible(el)))) {
        return true;
      }

      const bodyText = (document.body?.innerText || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      return /agregar el nombre|agregue su nombre|add your name|your first name|your last name/.test(bodyText);
    }).catch(() => false);
  }

  private static async hasBirthSurface(page: Page) {
    return await page.evaluate(() => {
      const isVisible = (el: Element | null) => {
        if (!el) return false;
        const node = el as HTMLElement;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const withinViewport =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth;
        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0' &&
          node.offsetWidth > 0 &&
          node.offsetHeight > 0 &&
          withinViewport
        );
      };

      const selectors = [
        '#BirthMonthDropdown',
        '#BirthDayDropdown',
        '#countryDropdownId',
        '#BirthMonth',
        '#BirthDay',
        '#BirthYear',
        '#Country',
        '#floatingLabelInput40',
        'select[name="BirthMonth"]',
        'select[name="BirthDay"]',
        'select[name="Country"]',
        'input[name="BirthYear"]',
        'button[name="BirthMonth"]',
        'button[name="BirthDay"]',
        'button[name="countryDropdownName"]',
        '[aria-label*="Month"]',
        '[aria-label*="Day"]',
        '[aria-label*="Year"]',
        '[aria-label*="Mes"]',
        '[aria-label*="Dia"]',
        '[aria-label*="Día"]',
        '[aria-label*="Ano"]',
        '[aria-label*="Año"]',
      ];

      if (selectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((el) => isVisible(el)))) {
        return true;
      }

      const bodyText = (document.body?.innerText || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      return /fecha de nacimiento|mes de nacimiento|dia de nacimiento|día de nacimiento|ano de nacimiento|año de nacimiento|pais o region|país o region|country or region|add some details/.test(bodyText);
    }).catch(() => false);
  }

  private static randomItem(values: string[]) {
    return values[Math.floor(Math.random() * values.length)] || values[0] || '';
  }

  private static sanitizeToken(value: string) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  private static isStrongMicrosoftPassword(value: string, bannedTokens: string[] = []) {
    const candidate = String(value || '').trim();
    if (candidate.length < 12 || candidate.length > 20) return false;
    if (!/[A-Z]/.test(candidate)) return false;
    if (!/[a-z]/.test(candidate)) return false;
    if (!/[0-9]/.test(candidate)) return false;
    if (!/[!@#$%&*]/.test(candidate)) return false;
    const low = candidate.toLowerCase();
    return !bannedTokens.some((token) => {
      const sanitized = this.sanitizeToken(token);
      return sanitized && sanitized.length >= 3 && low.includes(sanitized);
    });
  }

  private static buildStrongMicrosoftPassword(seedText = '') {
    const seed = this.sanitizeToken(seedText).slice(0, 2) || 'nv';
    const upper = this.randomItem(['Q', 'R', 'T', 'V', 'K', 'M']);
    const lower = this.randomItem(['a', 'e', 'i', 'o', 'u', 'y']);
    const digits = `${Math.floor(Math.random() * 90) + 10}${Math.floor(Math.random() * 9)}`;
    const symbolA = this.randomItem(this.PASSWORD_SYMBOLS);
    const symbolB = this.randomItem(this.PASSWORD_SYMBOLS);
    const candidate = `${upper}${symbolA}${seed[0] || 'n'}${digits}${seed[1] || 'v'}${lower}${symbolB}${Math.floor(Math.random() * 9)}`;
    return this.isStrongMicrosoftPassword(candidate, [seedText]) ? candidate : `Q${symbolA}v${digits}N${symbolB}7mR${Math.floor(Math.random() * 9)}`;
  }

  private static async cachePassword(password: string) {
    try {
      require('fs').writeFileSync('password_cache.txt', password);
    } catch (e) {}
  }

  static async restoreEmailStage(page: Page, cachedEmail?: string | null) {
    if (!cachedEmail) return false;

    const emailSelector = '#MemberName, #i0116, #i0117, #loginfmt, input[name="loginfmt"], input[type="email"]';
    const nextSelector = BrowserPolicyService.nextButtonSelectors();

    const hasEmailField = await page.isVisible(emailSelector).catch(() => false);
    if (!hasEmailField) return false;

    logger.warn(`[MILLENNIUM-REALITY] Restoring Microsoft signup with cached identity: ${cachedEmail}`);
    await page.fill(emailSelector, cachedEmail).catch(() => {});
    await page.waitForTimeout(500);
    await page.click(nextSelector).catch(() => {});
    await page.waitForTimeout(2000);
    return true;
  }

  static async advancePasswordStage(page: Page, cachedPassword?: string | null) {
    const passwordSelector = '#Password, input[name="passwd"], #i0118, input[type="password"]';
    const nextSelector = BrowserPolicyService.nextButtonSelectors();
    const hasPasswordField = await page.isVisible(passwordSelector).catch(() => false);
    if (!hasPasswordField) {
      return { advanced: false as const };
    }

    const currentEmail = await page.evaluate(() => {
      const pill = Array.from(document.querySelectorAll('div, span'))
        .map((node) => (node.textContent || '').trim())
        .find((text) => /@hotmail\.com|@outlook\.com/i.test(text));
      return pill || '';
    }).catch(() => '');

    const currentValue = await page.locator(passwordSelector).first().inputValue().catch(() => '');
    const candidates = Array.from(new Set([
      cachedPassword || '',
      currentValue || '',
      this.buildStrongMicrosoftPassword(currentEmail || currentValue),
      this.buildStrongMicrosoftPassword(`${currentEmail}${Date.now()}`),
    ].filter(Boolean)));

    for (const candidate of candidates) {
      await page.fill(passwordSelector, candidate).catch(() => {});
      await this.cachePassword(candidate);
      await page.waitForTimeout(250);
      await page.click(nextSelector).catch(() => {});
      await page.waitForTimeout(1800);
      let stage = await BrowserStageService.detectMicrosoftStage(page).catch(() => 'unknown');
      let profileSurfaceVisible = await this.hasProfileSurface(page);
      let birthSurfaceVisible = await this.hasBirthSurface(page);
      if (stage === 'birth' && birthSurfaceVisible && !profileSurfaceVisible) {
        await page.waitForTimeout(400);
        stage = await BrowserStageService.detectMicrosoftStage(page).catch(() => stage);
        profileSurfaceVisible = await this.hasProfileSurface(page);
        birthSurfaceVisible = await this.hasBirthSurface(page);
      }
      const confirmedAdvance =
        stage === 'success' ||
        stage === 'profile' ||
        (stage === 'birth' && birthSurfaceVisible && !profileSurfaceVisible);
      if (confirmedAdvance) {
        logger.info('[RECOVERY] Password stage advanced after automatic healing.', { stage });
        return { advanced: true as const, healedValue: candidate };
      }
      if (stage === 'birth' && profileSurfaceVisible) {
        logger.warn('[RECOVERY] Ignoring tentative birth transition because profile fields are still visible.', {
          stage,
          profileSurfaceVisible,
          birthSurfaceVisible,
        });
      }
    }

    return { advanced: false as const };
  }

  static async resolveRecovery(
    page: Page,
    expected: 'email' | 'password' | 'action',
    cachedEmail?: string | null,
    cachedPassword?: string | null
  ): Promise<{ action: 'retry' | 'skip' | 'use_selector'; selector?: string; healedValue?: string }> {
    const stage = await BrowserStageService.detectMicrosoftStage(page);

    if (stage === 'success') {
      return { action: 'skip', healedValue: 'ACCOUNT_SUCCESS' };
    }

    if (expected === 'password') {
      if (stage === 'birth' || stage === 'profile') {
        logger.info('[RECOVERY] Password step already transitioned. Skipping forward.');
        return { action: 'skip' };
      }

      if (stage === 'password') {
        const advanced = await this.advancePasswordStage(page, cachedPassword);
        if (advanced.advanced) {
          return { action: 'skip', healedValue: advanced.healedValue };
        }
        return { action: 'use_selector', selector: 'input[type="password"]:visible' };
      }

      if (stage === 'email') {
        await this.restoreEmailStage(page, cachedEmail);
        return { action: 'retry' };
      }
    }

    if (expected === 'action' && stage === 'password') {
      const advanced = await this.advancePasswordStage(page, cachedPassword);
      if (advanced.advanced) {
        return { action: 'skip', healedValue: advanced.healedValue };
      }
    }

    if (expected === 'email' && stage === 'email') {
      return { action: 'use_selector', selector: '#MemberName, #i0117, input[name="loginfmt"], input[type="email"]' };
    }

    if (stage === 'captcha') {
      logger.warn('[RECOVERY] CAPTCHA stage detected; pausing automatic escalation for this step.');
      return { action: 'retry' };
    }

    return { action: 'retry' };
  }
}

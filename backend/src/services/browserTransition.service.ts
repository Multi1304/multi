import * as fs from 'fs';
import * as path from 'path';
import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { BrowserDiagnosticsService } from './browserDiagnostics.service';
import { BrowserActionService } from './browserAction.service';
import { BrowserPolicyService } from './browserPolicy.service';
import { BrowserStageService } from './browserStage.service';

type BirthCacheState = {
  country?: string;
  month?: string;
  day?: string;
  year?: string;
};

export class BrowserTransitionService {
  private static readonly birthCachePath = path.resolve(process.cwd(), 'birth_cache.json');
  private static readonly profileCachePath = path.resolve(process.cwd(), 'profile_cache.json');
  private static readonly microsoftMonthsEs = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  private static splitEmailParts(value: string) {
    const candidate = String(value || '').trim();
    const atIndex = candidate.indexOf('@');
    if (atIndex <= 0) {
      return {
        localPart: candidate,
        domain: '',
      };
    }

    return {
      localPart: candidate.slice(0, atIndex),
      domain: candidate.slice(atIndex),
    };
  }

  private static readBirthCache(): BirthCacheState {
    try {
      if (!fs.existsSync(this.birthCachePath)) return {};
      return JSON.parse(fs.readFileSync(this.birthCachePath, 'utf8'));
    } catch {
      return {};
    }
  }

  private static readProfileCache() {
    try {
      if (!fs.existsSync(this.profileCachePath)) {
        return { firstName: '', lastName: '' };
      }
      const state = JSON.parse(fs.readFileSync(this.profileCachePath, 'utf8'));
      return {
        firstName: String(state.firstName || '').trim(),
        lastName: String(state.lastName || '').trim(),
      };
    } catch {
      return { firstName: '', lastName: '' };
    }
  }

  private static normalizeBirthDay(value?: string) {
    const numeric = parseInt(String(value || '').replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(numeric) || numeric < 1 || numeric > 31) {
      return '1';
    }
    return String(numeric);
  }

  private static normalizeBirthMonth(value?: string) {
    const raw = String(value || '').trim();
    const numeric = parseInt(raw.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) {
      return this.microsoftMonthsEs[numeric - 1];
    }

    const normalized = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    const monthIndex = this.microsoftMonthsEs.findIndex((entry) => {
      const candidate = entry
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      return candidate === normalized;
    });

    return monthIndex >= 0 ? this.microsoftMonthsEs[monthIndex] : 'Enero';
  }

  private static normalizeBirthYear(value?: string) {
    const digits = String(value || '').replace(/[^\d]/g, '');
    if (digits.length === 4) {
      return digits;
    }
    return '1998';
  }

  private static normalizeBirthCountry(value?: string) {
    const normalized = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (!normalized) return 'Espana';
    if (['espana', 'españa', 'spain'].includes(normalized)) return 'Espana';
    return String(value || '').trim();
  }

  private static async healMicrosoftEmailStage(page: Page) {
    const state = await page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
      const isVisible = (el: Element | null) => {
        if (!el) return false;
        const node = el as HTMLElement;
        const style = window.getComputedStyle(node);
        return style.visibility !== 'hidden' && style.display !== 'none' && node.offsetWidth > 0 && node.offsetHeight > 0;
      };
      const isTextualInput = (el: Element | null) => {
        if (!(el instanceof HTMLInputElement)) return false;
        const type = normalize(el.getAttribute('type')).toLowerCase();
        return !['hidden', 'checkbox', 'radio', 'file', 'submit', 'button'].includes(type);
      };
      const toSearchable = (node: Element | null) => {
        if (!node) return '';
        return [
          normalize(node.textContent),
          normalize(node.getAttribute('name')),
          normalize(node.getAttribute('aria-label')),
          normalize(node.getAttribute('placeholder')),
          normalize((node as HTMLInputElement).value),
          normalize((node as HTMLElement).id),
          normalize(node.getAttribute('role')),
          normalize(node.getAttribute('aria-haspopup')),
        ].join(' ').toLowerCase();
      };

      const toSelector = (node: Element | null) => {
        if (!node) return null;
        const el = node as HTMLElement;
        if (el.id) return `#${el.id}`;
        const name = el.getAttribute('name');
        if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
        const aria = el.getAttribute('aria-label');
        if (aria) return `[aria-label*="${aria.slice(0, 20)}"]`;
        return null;
      };

      const inputCandidates = Array.from(document.querySelectorAll('input, textarea'))
        .filter((node) => isVisible(node) && (node === document.activeElement || isTextualInput(node)))
        .map((node) => {
          const searchable = toSearchable(node);
          let score = 0;
          if (node === document.activeElement) score += 8;
          if ((node as HTMLInputElement).type?.toLowerCase() === 'email') score += 6;
          if (/correo|email|member|loginfmt|nuevo correo|e-?mail/.test(searchable)) score += 6;
          if ((node as HTMLInputElement).value?.includes('@')) score += 2;
          if (node instanceof HTMLInputElement && node.type.toLowerCase() === 'text') score += 1;
          return { node, score };
        })
        .sort((a, b) => b.score - a.score);

      const input = (inputCandidates[0]?.node || null) as HTMLInputElement | null;
      if (!input || !isVisible(input)) return null;

      const inputBox = input.getBoundingClientRect();
      const domainCandidates = Array.from(document.querySelectorAll('select, button, [role="combobox"], [aria-haspopup="listbox"], [tabindex]'))
        .filter((node) => node !== input && isVisible(node))
        .map((node) => {
          const searchable = toSearchable(node);
          const box = (node as HTMLElement).getBoundingClientRect();
          const sameRow = Math.abs(box.top - inputBox.top) < Math.max(48, inputBox.height);
          const toRight = box.left >= inputBox.right - 12;
          const horizontalGap = Math.max(0, box.left - inputBox.right);
          let score = 0;
          if (sameRow) score += 5;
          if (toRight) score += 5;
          if (/@hotmail\.com|@outlook\.com|hotmail|outlook|domain|correo/.test(searchable)) score += 8;
          if (horizontalGap < 180) score += Math.max(0, 4 - horizontalGap / 45);
          return {
            selector: toSelector(node),
            searchable,
            score,
          };
        })
        .filter((entry) => entry.selector && entry.score >= 7)
        .sort((a, b) => b.score - a.score);

      const bestDomainCandidate = domainCandidates[0] || null;
      const domainText = bestDomainCandidate?.searchable || '';
      const inferredDomain = domainText.includes('@outlook.com')
        ? '@outlook.com'
        : domainText.includes('@hotmail.com') || domainText.includes('hotmail')
          ? '@hotmail.com'
          : null;

      return {
        inputSelector: toSelector(input),
        inputValue: normalize(input.value),
        domainSelector: bestDomainCandidate?.selector || null,
        hasAdjacentDomainControl: !!bestDomainCandidate,
        inferredDomain,
      };
    }).catch(() => null as any);

    if (!state?.inputSelector || !state.inputValue) {
      return false;
    }

    const { localPart, domain } = this.splitEmailParts(state.inputValue);
    if (state.hasAdjacentDomainControl && domain) {
      await BrowserActionService.clearAndTypeVerified(page, state.inputSelector, localPart, { numeric: false });
      if (state.domainSelector) {
        await BrowserActionService.selectFromMixedControl(page, state.domainSelector, domain || state.inferredDomain || '@hotmail.com').catch(() => null);
      }
      return true;
    }

    if (!state.hasAdjacentDomainControl && localPart && !domain) {
      await BrowserActionService.clearAndTypeVerified(page, state.inputSelector, `${localPart}@hotmail.com`, { numeric: false });
      return true;
    }

    return false;
  }

  private static async healMicrosoftBirthStage(page: Page) {
    const cache = this.readBirthCache();
    const defaults: Required<BirthCacheState> = {
      country: this.normalizeBirthCountry(cache.country),
      month: this.normalizeBirthMonth(cache.month),
      day: this.normalizeBirthDay(cache.day),
      year: this.normalizeBirthYear(cache.year),
    };

    const controls = await page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const isVisible = (el: Element | null) => {
        if (!el) return false;
        const node = el as HTMLElement;
        const style = window.getComputedStyle(node);
        return style.visibility !== 'hidden' && style.display !== 'none' && node.offsetWidth > 0 && node.offsetHeight > 0;
      };
      const firstVisible = (...selectors: string[]) => {
        for (const selector of selectors) {
          const node = document.querySelector(selector);
          if (node && isVisible(node)) return selector;
        }
        return null;
      };
      const toSelector = (node: Element | null) => {
        if (!node) return null;
        const el = node as HTMLElement;
        if (el.id) return `#${el.id}`;
        const name = el.getAttribute('name');
        if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
        const aria = el.getAttribute('aria-label');
        if (aria) return `[aria-label*="${aria.slice(0, 20)}"]`;
        return null;
      };

      const describe = (node: Element) => {
        const searchable = [
          normalize(node.textContent),
          normalize(node.getAttribute('name')),
          normalize(node.getAttribute('aria-label')),
          normalize(node.getAttribute('placeholder')),
          normalize((node as HTMLInputElement).value),
          normalize((node as HTMLElement).id),
        ].join(' ');

        return {
          selector: toSelector(node),
          searchable,
        };
      };

      const visible = Array.from(document.querySelectorAll('select, input, button, [role="combobox"]'))
        .filter((node) => isVisible(node))
        .map((node) => describe(node))
        .filter((entry) => !!entry.selector);

      const findBest = (tokens: RegExp) => visible.find((entry) => tokens.test(entry.searchable))?.selector || null;

      return {
        country: firstVisible('#countryDropdownId', 'button[name="countryDropdownName"]') || findBest(/\bcountry\b|\bpais\b|\bregion\b/) || '#countryDropdownId',
        day: firstVisible('#BirthDayDropdown', 'button[name="BirthDay"]') || findBest(/\bbirthday\b|\bday\b|\bdia\b/) || '#BirthDayDropdown',
        month: firstVisible('#BirthMonthDropdown', 'button[name="BirthMonth"]') || findBest(/\bbirthmonth\b|\bmonth\b|\bmes\b/) || '#BirthMonthDropdown',
        year: firstVisible('#floatingLabelInput40', 'input[name="BirthYear"]', '#BirthYear') || findBest(/\bbirthyear\b|\byear\b|\bano\b/) || '#floatingLabelInput40',
      };
    }).catch(() => null as any);

    if (!controls) return false;

    let healed = false;
    const attemptField = async (kind: keyof BirthCacheState, selector: string | null, value: string) => {
      if (!selector) return;
      try {
        await BrowserActionService.selectFromMixedControl(page, selector, value);
        healed = true;
      } catch (error: any) {
        logger.warn('[BIRTH-HEAL] Field repair failed', {
          kind,
          selector,
          value,
          error: error?.message || error,
        });
      }
    };

    await attemptField('country', controls.country, defaults.country);
    await attemptField('day', controls.day, defaults.day);
    await attemptField('month', controls.month, defaults.month);
    await attemptField('year', controls.year, defaults.year);

    const completion = await page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const yearInput = document.querySelector('#floatingLabelInput40, input[name="BirthYear"], #BirthYear') as HTMLInputElement | null;
      const countryButton = document.querySelector('#countryDropdownId') as HTMLElement | null;
      const dayButton = document.querySelector('#BirthDayDropdown') as HTMLElement | null;
      const monthButton = document.querySelector('#BirthMonthDropdown') as HTMLElement | null;

      const collect = (node: Element | null) => normalize(node?.textContent || (node as HTMLInputElement | null)?.value || node?.getAttribute('aria-label'));
      const result = {
        country: collect(countryButton),
        day: collect(dayButton),
        month: collect(monthButton),
        year: normalize(yearInput?.value),
      };

      const looksSelected = (value: string, placeholders: string[]) => !!value && !placeholders.some((placeholder) => value === placeholder || value.includes(placeholder));
      return {
        state: result,
        complete:
          looksSelected(result.country, ['pais', 'region', 'country']) &&
          looksSelected(result.day, ['dia', 'day']) &&
          looksSelected(result.month, ['mes', 'month']) &&
          !!result.year,
      };
    }).catch(() => ({ state: {}, complete: false } as any));

    if (!completion.complete) {
      logger.warn('[BIRTH-HEAL] Birth fields still incomplete after repair', completion.state);
    }

    return healed && completion.complete;
  }

  private static async healMicrosoftProfileStage(page: Page) {
    const cache = this.readProfileCache();
    if (!cache.firstName || !cache.lastName) return false;

    const controls = await page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const isVisible = (el: Element | null) => {
        if (!el) return false;
        const node = el as HTMLElement;
        const style = window.getComputedStyle(node);
        return style.visibility !== 'hidden' && style.display !== 'none' && node.offsetWidth > 0 && node.offsetHeight > 0;
      };
      const toSelector = (node: Element | null) => {
        if (!node) return null;
        const el = node as HTMLElement;
        if (el.id) return `#${el.id}`;
        const name = el.getAttribute('name');
        if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
        const aria = el.getAttribute('aria-label');
        if (aria) return `[aria-label*="${aria.slice(0, 20)}"]`;
        return null;
      };

      const visibleInputs = Array.from(document.querySelectorAll('input, textarea'))
        .filter((node) => isVisible(node))
        .map((node) => {
          const searchable = normalize([
            (node as HTMLElement).id,
            node.getAttribute('name'),
            node.getAttribute('aria-label'),
            node.getAttribute('placeholder'),
            (node as HTMLInputElement).type,
          ].join(' '));
          return {
            selector: toSelector(node),
            searchable,
          };
        })
        .filter((entry) => !!entry.selector);

      const findBest = (pattern: RegExp) => visibleInputs.find((entry) => pattern.test(entry.searchable))?.selector || null;

      return {
        firstName: findBest(/firstnameinput|firstname|first name|given|nombre/),
        lastName: findBest(/lastnameinput|lastname|last name|surname|family|apellido/),
      };
    }).catch(() => null as any);

    if (!controls?.firstName || !controls?.lastName) return false;

    let changed = false;
    const ensureValue = async (selector: string, value: string) => {
      const currentValue = await page.locator(selector).first().inputValue().catch(() => '');
      if (currentValue.trim()) return true;
      await BrowserActionService.clearAndTypeVerified(page, selector, value);
      changed = true;
      const verified = await page.locator(selector).first().inputValue().catch(() => '');
      return Boolean(verified.trim());
    };

    const firstReady = await ensureValue(controls.firstName, cache.firstName);
    const lastReady = await ensureValue(controls.lastName, cache.lastName);

    if (!firstReady || !lastReady) {
      return false;
    }

    if (changed) {
      logger.info('[PROFILE-HEAL] Rehydrated missing Microsoft profile fields from cache.', {
        firstSelector: controls.firstName,
        lastSelector: controls.lastName,
      });
    }

    return true;
  }

  static async assertAdvanceClickProgress(page: Page, selector: string, beforeStage?: string) {
    if (!BrowserPolicyService.isAdvanceButton(selector)) return;

    const priorStage = beforeStage || await BrowserStageService.detectMicrosoftStage(page).catch(() => 'unknown');
    if (priorStage === 'unknown' || priorStage === 'success') return;

    await page.waitForTimeout(1200 + Math.random() * 500);

    const stage = await BrowserStageService.detectMicrosoftStage(page).catch(() => 'unknown');
    if (stage === priorStage) {
      if (stage === 'email') {
        const healed = await this.healMicrosoftEmailStage(page).catch(() => false);
        if (healed) {
          await page.waitForTimeout(300);
          await page.click(selector).catch(() => null);
          await page.waitForTimeout(1200 + Math.random() * 500);
          const retriedStage = await BrowserStageService.detectMicrosoftStage(page).catch(() => 'unknown');
          if (retriedStage !== priorStage) {
            return;
          }
        }
      }

      if (stage === 'profile') {
        const healedProfile = await this.healMicrosoftProfileStage(page).catch(() => false);
        if (healedProfile) {
          await page.waitForTimeout(300);
          await page.click(selector).catch(() => null);
          await page.waitForTimeout(1200 + Math.random() * 500);
          const retriedStage = await BrowserStageService.detectMicrosoftStage(page).catch(() => 'unknown');
          if (retriedStage !== priorStage) {
            return;
          }
        }
      }

      if (stage === 'birth') {
        const healedBirth = await this.healMicrosoftBirthStage(page).catch(() => false);
        if (healedBirth) {
          await page.waitForTimeout(400);
          await page.click(selector).catch(() => null);
          await page.waitForTimeout(1200 + Math.random() * 500);
          const retriedStage = await BrowserStageService.detectMicrosoftStage(page).catch(() => 'unknown');
          if (retriedStage !== priorStage) {
            return;
          }
        }
      }

      const validationMessage = await BrowserDiagnosticsService.getVisibleValidationMessage(page);
      const suffix = validationMessage ? ` Validation message: ${validationMessage}` : '';
      throw new Error(`Advance click did not change stage: selector ${selector} clicked but current stage is still ${stage}.${suffix}`);
    }
  }
}

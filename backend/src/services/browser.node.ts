import { chromium, Browser, BrowserContext, Page, BrowserContextOptions } from 'playwright';
import { logger } from '../utils/logger';
import retry from 'async-retry';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs/promises';
import { config } from '../config';
import { ProfileStateService } from './profileState.service';
import { BrowserPolicyService } from './browserPolicy.service';
import { BrowserDiagnosticsService } from './browserDiagnostics.service';
import { BrowserStageService, BrowserStage } from './browserStage.service';
import { BrowserRecoveryService } from './browserRecovery.service';
import { BrowserControlService } from './browserControl.service';
import { BrowserActionService } from './browserAction.service';
import { BrowserSelectorService } from './browserSelector.service';
import { BrowserTransitionService } from './browserTransition.service';
import { TenantCapacityService } from './tenantCapacity.service';
import { MemoryAdmissionService } from './memoryAdmission.service';
import { HumanBehaviorPolicyService } from './humanBehaviorPolicy.service';
import { FingerprintHardeningService } from './fingerprintHardening.service';
import { SessionPersistenceService } from './sessionPersistence.service';
import { PlatformCompatibilityService } from './platformCompatibility.service';
import { SandboxRuntimeEmulationService } from './sandboxRuntimeEmulation.service';
import { ProductionRuntimeEmulationService } from './productionRuntimeEmulation.service';
import { RuntimeEnvironmentService } from './runtimeEnvironment.service';
import { RuntimeMitigationService } from './runtimeMitigation.service';
import { ProfileConsistencyService } from './profileConsistency.service';
import { ThirdPartyCaptchaService } from './thirdPartyCaptcha.service';
import { LocalVisionCaptchaService } from './localVisionCaptcha.service';
import { LocalAudioCaptchaService } from './localAudioCaptcha.service';
import { CaptchaRuntimePolicyService } from './captchaRuntimePolicy.service';
import { prisma } from '../prisma';

export class BrowserNodeService {
  private static browser: Browser | null = null;
  private static lastEmail: string | null = null;
  private static lastPassword: string | null = null;
  private static readonly BIRTH_CACHE_FILE = path.resolve(process.cwd(), 'birth_cache.json');
  private static readonly PROFILE_CACHE_FILE = path.resolve(process.cwd(), 'profile_cache.json');
  private static readonly MICROSOFT_SIGNUP_URLS = ['signup.live.com', 'outlook.live.com'];
  private static readonly activeContexts = new Map<string, BrowserContext>();
  private static readonly activeRuntimeLeases = new Map<string, string>();
  private static readonly runtimeLeaseIntervals = new Map<string, NodeJS.Timeout>();
  private static readonly activeProfileTenants = new Map<string, string>();
  private static readonly idleContextTimers = new Map<string, NodeJS.Timeout>();
  private static readonly CONTEXT_IDLE_CLOSE_MS = 8000;

  private static isLightweightTestPage(page: any) {
    return typeof page?.locator !== 'function' && typeof page?.waitForSelector === 'function';
  }

  private static async executeLightweightStep(page: any, step: any): Promise<{ status: 'completed' | 'failed'; output?: any; error?: string }> {
    const { type, config } = step;
    const retryOptions = this.getRetryOptions(step);

    try {
      if (type?.toLowerCase() === 'click') {
        await retry(async () => {
          await page.waitForSelector(config.selector);
          await page.click(config.selector);
        }, retryOptions);
        return { status: 'completed', output: { selector: config.selector } };
      }

      if (type?.toLowerCase() === 'type') {
        await retry(async () => {
          await page.waitForSelector(config.selector);
          if (typeof page.fill === 'function') {
            await page.fill(config.selector, config.text || '');
            return;
          }
          if (typeof page.type === 'function') {
            await page.type(config.selector, config.text || '');
            return;
          }
          throw new Error('Mock page does not support fill/type');
        }, retryOptions);
        return { status: 'completed', output: { selector: config.selector } };
      }

      if (type?.toLowerCase() === 'wait_for_selector' || type?.toLowerCase() === 'wait') {
        await retry(async () => {
          await page.waitForSelector(config.selector);
        }, retryOptions);
        return { status: 'completed', output: { selector: config.selector } };
      }

      return { status: 'completed', output: {} };
    } catch (error: any) {
      return { status: 'failed', error: error?.message || 'Lightweight step execution failed' };
    }
  }

  private static clearIdleContextTimer(profileId: string) {
    const timer = this.idleContextTimers.get(profileId);
    if (timer) {
      clearTimeout(timer);
      this.idleContextTimers.delete(profileId);
    }
  }

  private static persistBirthField(selector: string, value: string) {
    const field = BrowserPolicyService.inferExpectedField(selector);
    if (!['country', 'month', 'day', 'year'].includes(field)) return;

    try {
      const fsSync = require('fs');
      let state: Record<string, string> = {};
      if (fsSync.existsSync(this.BIRTH_CACHE_FILE)) {
        state = JSON.parse(fsSync.readFileSync(this.BIRTH_CACHE_FILE, 'utf8'));
      }
      state[field] = String(value || '').trim();
      fsSync.writeFileSync(this.BIRTH_CACHE_FILE, JSON.stringify(state, null, 2));
    } catch (error: any) {
      logger.warn('Failed to persist birth field cache', {
        selector,
        field,
        error: error?.message,
      });
    }
  }

  private static persistProfileField(selector: string, value: string) {
    const lowSel = (selector || '').toLowerCase();
    const field = /firstname|nombre|first/.test(lowSel)
      ? 'firstName'
      : /lastname|apellido|last/.test(lowSel)
        ? 'lastName'
        : /password|passwd|i0118/.test(lowSel)
          ? 'password'
          : /member|loginfmt|i0117|email/.test(lowSel)
            ? 'email'
            : null;
    if (!field) return;

    try {
      const fsSync = require('fs');
      let state: Record<string, string> = {};
      const cacheFile = field === 'password' || field === 'email' ? 'identity_cache.json' : this.PROFILE_CACHE_FILE;
      if (fsSync.existsSync(cacheFile)) {
        state = JSON.parse(fsSync.readFileSync(cacheFile, 'utf8'));
      }
      state[field] = String(value || '').trim();
      fsSync.writeFileSync(cacheFile, JSON.stringify(state, null, 2));

      // Legacy compatibility for existing recovery paths
      if (field === 'email') fsSync.writeFileSync('identity_cache.txt', state[field]);
      if (field === 'password') fsSync.writeFileSync('password_cache.txt', state[field]);
    } catch (error: any) {
      logger.warn('Failed to persist profile field cache', { selector, field, error: error?.message });
    }
  }

  public static seedProfileIdentity(firstName?: string, lastName?: string) {
    const normalizedFirstName = String(firstName || '').trim();
    const normalizedLastName = String(lastName || '').trim();
    const nextState: Record<string, string> = {};

    if (normalizedFirstName) {
      nextState.firstName = normalizedFirstName;
    }
    if (normalizedLastName) {
      nextState.lastName = normalizedLastName;
    }

    try {
      const fsSync = require('fs');
      if (!normalizedFirstName && !normalizedLastName) {
        if (fsSync.existsSync(this.PROFILE_CACHE_FILE)) {
          fsSync.unlinkSync(this.PROFILE_CACHE_FILE);
        }
        return;
      }

      fsSync.writeFileSync(this.PROFILE_CACHE_FILE, JSON.stringify(nextState, null, 2));
    } catch (error: any) {
      logger.warn('Failed to seed profile identity cache', {
        error: error?.message,
      });
    }
  }

  private static getCachedProfileFields() {
    try {
      const fsSync = require('fs');
      if (!fsSync.existsSync(this.PROFILE_CACHE_FILE)) {
        return { firstName: '', lastName: '' };
      }
      const state = JSON.parse(fsSync.readFileSync(this.PROFILE_CACHE_FILE, 'utf8'));
      return {
        firstName: String(state.firstName || '').trim(),
        lastName: String(state.lastName || '').trim(),
      };
    } catch {
      return { firstName: '', lastName: '' };
    }
  }

  private static async hydrateIdentityRescue(page: Page): Promise<boolean> {
    const fsSync = require('fs');
    let hydratedCount = 0;

    // 1. Profile Names
    const cachedProfile = this.getCachedProfileFields();
    if (cachedProfile.firstName || cachedProfile.lastName) {
      const firstSelectors = ['#firstNameInput', '#FirstName', 'input[name="firstNameInput"]', 'input[name="FirstName"]', 'input[placeholder*="Nombre"]'];
      const lastSelectors = ['#lastNameInput', '#LastName', 'input[name="lastNameInput"]', 'input[name="LastName"]', 'input[placeholder*="Apellido"]'];
      
      const firstSel = await this.resolveFirstVisible(page, firstSelectors);
      const lastSel = await this.resolveFirstVisible(page, lastSelectors);

      if (firstSel && cachedProfile.firstName) {
        await this.clearAndTypeVerified(page, firstSel, cachedProfile.firstName, { numeric: false });
        hydratedCount++;
      }
      if (lastSel && cachedProfile.lastName) {
        await this.clearAndTypeVerified(page, lastSel, cachedProfile.lastName, { numeric: false });
        hydratedCount++;
      }
    }

    // 2. Identity & Password
    let identityState: any = {};
    if (fsSync.existsSync('identity_cache.json')) {
      try { identityState = JSON.parse(fsSync.readFileSync('identity_cache.json', 'utf8')); } catch(e) {}
    }

    if (identityState.email) {
      const emailSelectors = ['#MemberName', 'input[name="loginfmt"]', '#i0117', 'input[type="email"]', 'input[name*="correo"]'];
      const emailSel = await this.resolveFirstVisible(page, emailSelectors);
      if (emailSel) {
        const current = await page.locator(emailSel).first().inputValue().catch(() => '');
        // Aggressive: If current value doesn't contain '@' but cache does, re-type full email
        const shouldType = !current || (identityState.email.includes('@') && !current.includes('@'));
        if (shouldType) {
          await this.clearAndTypeVerified(page, emailSel, identityState.email, { numeric: false });
          hydratedCount++;
        }
      }
    }

    if (identityState.password) {
      const passSelectors = ['#Password', 'input[name="passwd"]', '#i0118', 'input[type="password"]'];
      const passSel = await this.resolveFirstVisible(page, passSelectors);
      if (passSel) {
        const current = await page.locator(passSel).first().inputValue().catch(() => '');
        if (!current) {
          await this.clearAndTypeVerified(page, passSel, identityState.password, { numeric: false });
          hydratedCount++;
        }
      }
    }

    // 3. Birthdate
    if (fsSync.existsSync(this.BIRTH_CACHE_FILE)) {
      try {
        const birthState = JSON.parse(fsSync.readFileSync(this.BIRTH_CACHE_FILE, 'utf8'));
        const fields = ['day', 'month', 'year', 'country'];
        for (const field of fields) {
          if (birthState[field]) {
            const selector = await this.inferSemanticFieldSelector(page, field as any);
            if (selector) {
              const current = await page.locator(selector).first().inputValue().catch(() => '');
              if (!current || current === '0') {
                await this.selectFromMixedControl(page, selector, birthState[field]);
                hydratedCount++;
              }
            }
          }
        }
      } catch(e) {}
    }

    if (hydratedCount > 0) {
      logger.info(`[IDENTITY-HYDRATION] Successfully restored ${hydratedCount} fields from deterministic cache.`);
    }
    return hydratedCount > 0;
  }

  private static async resolveFirstVisible(page: Page, selectors: string[]) {
    for (const s of selectors) {
      if (await page.isVisible(s).catch(() => false)) return s;
    }
    return null;
  }

  private static isIgnorableIdlePage(page: Page) {
    if (page.isClosed()) return true;
    const url = (page.url() || '').toLowerCase();
    return !url || url === 'about:blank' || url.startsWith('chrome://newtab');
  }

  private static scheduleIdleContextClose(profileId: string, reason: string) {
    this.clearIdleContextTimer(profileId);

    const timer = setTimeout(() => {
      const context = this.activeContexts.get(profileId);
      if (!context) {
        this.idleContextTimers.delete(profileId);
        return;
      }

      const meaningfulPages = context.pages().filter((page) => !this.isIgnorableIdlePage(page));
      if (meaningfulPages.length > 0) {
        this.idleContextTimers.delete(profileId);
        return;
      }

      logger.info('[RUNTIME-IDLE] Closing idle runtime context', {
        profileId,
        reason,
      });
      context.close().catch((error: any) => {
        logger.warn('Failed to close idle runtime context', {
          profileId,
          reason,
          error: error?.message,
        });
      }).finally(() => {
        this.idleContextTimers.delete(profileId);
      });
    }, this.CONTEXT_IDLE_CLOSE_MS);

    this.idleContextTimers.set(profileId, timer);
  }

  static async shutdownAll(reason = 'shutdown') {
    const profileIds = Array.from(new Set([
      ...this.activeContexts.keys(),
      ...this.activeRuntimeLeases.keys(),
      ...this.activeProfileTenants.keys(),
    ]));

    for (const profileId of profileIds) {
      this.clearIdleContextTimer(profileId);

      const context = this.activeContexts.get(profileId);
      if (context) {
        logger.info('[RUNTIME-SHUTDOWN] Closing active context', { profileId, reason });
        await context.close().catch((error: any) => {
          logger.warn('Failed to close runtime context during shutdown', {
            profileId,
            reason,
            error: error?.message,
          });
        });
        continue;
      }

      const token = this.activeRuntimeLeases.get(profileId);
      if (token) {
        await ProfileStateService.releaseRuntimeLease(profileId, token).catch(() => null);
      }
      this.activeRuntimeLeases.delete(profileId);

      const tenantId = this.activeProfileTenants.get(profileId);
      if (tenantId) {
        await TenantCapacityService.releaseActiveProfile(tenantId, profileId).catch(() => null);
      }
      this.activeProfileTenants.delete(profileId);

      const interval = this.runtimeLeaseIntervals.get(profileId);
      if (interval) {
        clearInterval(interval);
      }
      this.runtimeLeaseIntervals.delete(profileId);
    }
  }

  // Configuration for retries
  private static RETRY_OPTS = {
    retries: 5,
    minTimeout: 3000,
    maxTimeout: 15000,
    onRetry: async (err: any, attempt: number) => {
      logger.warn(`Browser action failed, retrying (${attempt}/5)...`, { error: err.message });
    }
  };

  private static getStepTimeout(step: any, fallbackMs: number) {
    return Number(step?.contract?.timeoutMs || step?.config?.timeout || fallbackMs);
  }

  private static getRetryOptions(step: any) {
    const retries = Math.max(1, Number(step?.contract?.maxRetries || this.RETRY_OPTS.retries));
    return {
      ...this.RETRY_OPTS,
      retries,
      onRetry: async (err: any, attempt: number) => {
        logger.warn(`Browser action failed, retrying (${attempt}/${retries})...`, {
          error: err.message,
          stepId: step?.id,
          stepType: step?.type
        });
      }
    };
  }

  private static isStrictRuntime() {
    return BrowserPolicyService.isStrictRuntime();
  }

  private static shouldAllowAutoHealingMutations() {
    return BrowserPolicyService.allowAutoHealingMutations();
  }

  private static shouldAllowAggressiveClicks() {
    return BrowserPolicyService.allowAggressiveClicks();
  }

  private static async captureDiagnostic(page: Page, type: string) {
    try {
      const ts = Date.now();
      const screenshotPath = path.resolve(process.cwd(), `stasis_${type.replace(/[^a-z0-9]/gi, '_')}_${ts}.png`);
      await page.screenshot({ path: screenshotPath }).catch(() => { });
      logger.error(`[STASIS-DIAGNOSTIC] Screenshot saved: ${screenshotPath}`);
    } catch (e) { }
  }

  private static async captureVisibleFormContext(page: Page) {
    return BrowserDiagnosticsService.captureVisibleFormContext(page);
  }

  private static async buildTimeoutDiagnostic(page: Page, primarySelector: string) {
    const url = page.url();
    const stage = await this.getMicrosoftStage(page).catch(() => 'unknown');
    const context = await this.captureVisibleFormContext(page);

    const summarized = context.items.map((item: any, index: number) => {
      const attrs = [
        item.tag,
        item.type ? `type=${item.type}` : '',
        item.role ? `role=${item.role}` : '',
        item.name ? `name=${item.name}` : '',
        item.id ? `id=${item.id}` : '',
        item.ariaLabel ? `aria=${item.ariaLabel}` : '',
        item.placeholder ? `placeholder=${item.placeholder}` : '',
        item.value ? `value=${item.value}` : '',
        item.text ? `text=${item.text}` : ''
      ].filter(Boolean).join(', ');
      return `${index + 1}. ${attrs}`;
    });

    const expectedTokens = Array.from(new Set(
      primarySelector
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(token => token.length > 1)
    ));

    const suggestions = context.items
      .map((item: any) => {
        const searchable = [
          item.tag,
          item.type,
          item.role,
          item.name,
          item.id,
          item.ariaLabel,
          item.placeholder,
          item.text
        ].join(' ').toLowerCase();

        let score = 0;
        for (const token of expectedTokens) {
          if (searchable.includes(token)) score += 2;
          if (token === 'month' && /(mes|month)/i.test(searchable)) score += 4;
          if (token === 'day' && /(día|dia|day)/i.test(searchable)) score += 4;
          if (token === 'year' && /(año|ano|year)/i.test(searchable)) score += 4;
          if (token === 'birth' && /(birth|fecha|nacimiento)/i.test(searchable)) score += 4;
          if (token === 'country' && /(país|pais|country|región|region)/i.test(searchable)) score += 4;
        }

        if (item.tag === 'select' || item.role === 'combobox') score += 1;

        return {
          score,
          item,
          hint: (item.selectorHints || [])[0] || `${item.tag}${item.id ? `#${item.id}` : ''}`
        };
      })
      .filter((entry: any) => entry.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5)
      .map((entry: any, index: number) => {
        const item = entry.item;
        const label = [item.ariaLabel, item.placeholder, item.text, item.name, item.id].filter(Boolean)[0] || item.tag;
        return `${index + 1}. ${entry.hint} (match=${entry.score}, label=${label})`;
      });

    return {
      url,
      stage,
      title: context.title,
      controls: summarized,
      suggestions
    };
  }

  private static async capturePreClickTrace(page: Page, selector: string) {
    return await page.evaluate((targetSelector) => {
      const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
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

      const target = document.querySelector(targetSelector);
      const visibleInputs = Array.from(document.querySelectorAll('input, select, textarea'))
        .filter(isVisible)
        .slice(0, 12)
        .map((node) => {
          const el = node as HTMLInputElement;
          return {
            tag: el.tagName.toLowerCase(),
            type: normalize(el.getAttribute('type')),
            name: normalize(el.getAttribute('name')),
            id: normalize(el.id),
            ariaLabel: normalize(el.getAttribute('aria-label')),
            placeholder: normalize(el.getAttribute('placeholder')),
            value: normalize(el.value).slice(0, 80)
          };
        });

      const anchorInput = (() => {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement && isVisible(active)) {
          return active;
        }
        return Array.from(document.querySelectorAll('input, textarea'))
          .filter(isVisible)
          .find((node) => /correo|email|member|loginfmt|nuevo correo/.test(toSearchable(node))) as HTMLInputElement | undefined;
      })();

      const anchorBox = anchorInput ? anchorInput.getBoundingClientRect() : null;
      const nearbyControls = anchorBox
        ? Array.from(document.querySelectorAll('select, button, [role="combobox"], [aria-haspopup="listbox"], [tabindex]'))
            .filter((node) => node !== anchorInput && isVisible(node))
            .map((node) => {
              const box = (node as HTMLElement).getBoundingClientRect();
              const sameRow = Math.abs(box.top - anchorBox.top) < Math.max(48, anchorBox.height);
              const toRight = box.left >= anchorBox.right - 12;
              const distance = Math.abs(box.left - anchorBox.right);
              return {
                tag: node.tagName.toLowerCase(),
                name: normalize(node.getAttribute('name')),
                id: normalize((node as HTMLElement).id),
                role: normalize(node.getAttribute('role')),
                ariaLabel: normalize(node.getAttribute('aria-label')),
                text: normalize(node.textContent).slice(0, 80),
                value: normalize((node as HTMLInputElement).value).slice(0, 80),
                sameRow,
                toRight,
                distance: Math.round(distance),
              };
            })
            .filter((item) => item.sameRow && item.toRight && item.distance < 260)
            .slice(0, 8)
        : [];

      return {
        targetSelector,
        targetText: normalize(target?.textContent).slice(0, 120),
        activeElement: (() => {
          const active = document.activeElement as HTMLElement | null;
          if (!active) return '';
          return [active.tagName.toLowerCase(), active.id ? `#${active.id}` : '', active.getAttribute('name') ? `[name="${active.getAttribute('name')}"]` : '']
            .filter(Boolean)
            .join('');
        })(),
        visibleInputs,
        domainControls: nearbyControls.filter((item) => /@hotmail\.com|@outlook\.com|hotmail|outlook|domain|correo/.test(
          [item.value, item.text, item.ariaLabel, item.name, item.id, item.role].join(' ').toLowerCase()
        )),
        nearbyControls,
      };
    }, selector).catch(() => ({ targetSelector: selector, targetText: '', activeElement: '', visibleInputs: [] as any[], domainControls: [] as any[], nearbyControls: [] as any[] }));
  }

  private static inferExpectedField(primarySelector: string): 'month' | 'day' | 'year' | 'country' | 'birth' | 'generic' {
    const lowSel = primarySelector.toLowerCase();
    if (lowSel.includes('country') || lowSel.includes('pais') || lowSel.includes('país') || lowSel.includes('region') || lowSel.includes('región')) return 'country';
    if (lowSel.includes('month') || lowSel.includes('mes')) return 'month';
    if (lowSel.includes('day') || lowSel.includes('dia') || lowSel.includes('día')) return 'day';
    if (lowSel.includes('year') || lowSel.includes('ano') || lowSel.includes('año')) return 'year';
    if (lowSel.includes('birth') || lowSel.includes('fecha') || lowSel.includes('nacimiento')) return 'birth';
    return 'generic';
  }

  private static async inferSemanticFieldSelector(page: Page, expected: 'month' | 'day' | 'year' | 'country' | 'birth' | 'generic'): Promise<string | null> {
    if (expected === 'generic') return null;

    return await page.evaluate((fieldKind) => {
      const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
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

      const tokenMap: Record<string, string[]> = {
        month: ['month', 'mes', 'birthmonth'],
        day: ['day', 'día', 'dia', 'birthday'],
        year: ['year', 'año', 'ano', 'birthyear'],
        country: ['country', 'país', 'pais', 'region', 'región'],
        birth: ['birth', 'fecha', 'nacimiento', 'dob']
      };

      const candidates = Array.from(document.querySelectorAll('input, select, textarea, button, [role="combobox"], [role="listbox"], [role="option"]'))
        .filter(isVisible)
        .map((el) => {
          const node = el as HTMLElement;
          const tag = node.tagName.toLowerCase();
          const rawName = node.getAttribute('name');
          const rawAria = node.getAttribute('aria-label');
          const rawPlaceholder = node.getAttribute('placeholder');
          const name = normalize(rawName).toLowerCase();
          const id = normalize(node.id).toLowerCase();
          const ariaLabel = normalize(rawAria).toLowerCase();
          const placeholder = normalize(rawPlaceholder).toLowerCase();
          const role = normalize(node.getAttribute('role')).toLowerCase();
          const text = normalize(node.textContent).toLowerCase();
          const searchable = [tag, name, id, ariaLabel, placeholder, role, text].join(' ');
          const looksLikeProfileField = /firstname|lastname|nombre|apellido|given|surname|family/.test(searchable);

          if (looksLikeProfileField) {
            return null;
          }

          let selector = '';
          if (node.id) selector = `#${node.id}`;
          else if (rawName) selector = `${tag}[name="${rawName}"]`;
          else if (rawAria) selector = `[aria-label*="${rawAria.slice(0, 20)}"]`;
          else if (rawPlaceholder) selector = `[placeholder*="${rawPlaceholder.slice(0, 20)}"]`;
          else if (role) selector = `[role="${role}"]`;
          else selector = tag;

          let score = 0;
          for (const token of tokenMap[fieldKind] || []) {
            if (searchable.includes(token)) score += 3;
          }

          if (fieldKind === 'month' && (role === 'combobox' || tag === 'select')) score += 2;
          if (fieldKind === 'day' && (role === 'combobox' || tag === 'select' || tag === 'input')) score += 2;
          if (fieldKind === 'year' && tag === 'input') score += 2;
          if (fieldKind === 'country' && (role === 'combobox' || tag === 'select')) score += 2;
          if (fieldKind === 'birth' && /month|mes|day|dia|día|year|año|ano/.test(searchable)) score += 2;

          return { selector, score };
        })
        .filter((entry): entry is { selector: string; score: number } => !!entry)
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);

      return candidates[0]?.selector || null;
    }, expected).catch(() => null);
  }

  /**
   * Human-Mimetic Mouse Movement (V4.70)
   */
  private static async humanMouseMove(page: Page, selector: string) {
    try {
      const box = await page.locator(selector).boundingBox();
      if (!box) return;

      const targetX = box.x + box.width / 2 + (Math.random() * 10 - 5);
      const targetY = box.y + box.height / 2 + (Math.random() * 6 - 3);

      const steps = await HumanBehaviorPolicyService.nextMouseSteps();
      for (let i = 0; i <= steps; i++) {
        const x = targetX + (Math.random() * 20 - 10) * (1 - i / steps);
        const y = targetY + (Math.random() * 20 - 10) * (1 - i / steps);
        await page.mouse.move(x, y);
        if (i % 5 === 0) await page.waitForTimeout(await HumanBehaviorPolicyService.nextJitterPause());
      }
      await page.mouse.move(targetX, targetY);
    } catch (e) { }
  }

  /**
   * Passive Jitter: Mimics a resting human hand
   */
  private static async jitterMouse(page: Page) {
    try {
      const width = page.viewportSize()?.width || 1280;
      const height = page.viewportSize()?.height || 720;
      
      // Gaze Sweep: Randomized trajectories
      const points = [
        { x: Math.random() * width, y: Math.random() * height },
        { x: Math.random() * width, y: Math.random() * height },
        { x: Math.random() * width, y: Math.random() * height }
      ];
      
      for (const p of points) {
        await page.mouse.move(p.x, p.y, { steps: await HumanBehaviorPolicyService.nextMouseSteps() });
        await page.waitForTimeout(await HumanBehaviorPolicyService.nextJitterPause());
      }
    } catch (e) { }
  }

  private static parseViewport(fingerprint?: any) {
    const raw = fingerprint?.screenResolution;
    if (typeof raw === 'string') {
      const match = raw.match(/(\d+)\s*x\s*(\d+)/i);
      if (match) {
        return { width: Number(match[1]), height: Number(match[2]) };
      }
    }

    if (fingerprint?.screenWidth && fingerprint?.screenHeight) {
      return {
        width: Number(fingerprint.screenWidth),
        height: Number(fingerprint.screenHeight)
      };
    }

    return { width: 1536, height: 864 };
  }

  private static hardenFingerprint(fingerprint?: any) {
    if (!fingerprint) return fingerprint;
    return FingerprintHardeningService.harden(fingerprint).fingerprint;
  }

  private static buildContextOptions(fingerprint?: any, proxy?: any): BrowserContextOptions & { headless?: boolean; args?: string[] } {
    const viewport = this.parseViewport(fingerprint);
    const locale = fingerprint?.language || 'es-ES';
    const timezoneId = fingerprint?.timezoneId || fingerprint?.timezone || 'Europe/Madrid';
    const userAgent = fingerprint?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const isMobile = Boolean(fingerprint?.isMobile || /iphone|android|mobile/i.test(userAgent));
    const hasTouch = fingerprint?.maxTouchPoints ? Number(fingerprint.maxTouchPoints) > 0 : isMobile;

    const options: BrowserContextOptions & { headless?: boolean; args?: string[]; channel?: string } = {
      headless: process.env.BROWSER_HEADLESS !== 'false',
      channel: 'msedge',
      viewport,
      userAgent,
      deviceScaleFactor: Number(fingerprint?.deviceScaleFactor || 1),
      hasTouch,
      isMobile,
      locale,
      timezoneId,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-position=0,0',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--js-flags="--max-old-space-size=256"',
        '--disable-features=IsolateOrigins,site-per-process',
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--dns-over-https-urls=https://cloudflare-dns.com/dns-query',
        '--password-store=basic',
        '--use-mock-keychain',
      ]
    };

    if (proxy?.server) {
      (options as any).proxy = proxy;
    }

    return options;
  }

  private static async writeSessionSnapshot(profileId: string, fingerprint?: any, proxy?: any, context?: BrowserContext | null, userDataDir?: string, tenantId?: string) {
    try {
      const snapshotPath = path.resolve(process.cwd(), 'logs', 'profile-sessions', `${profileId}.json`);
      await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
      const sessionPersistence = await SessionPersistenceService.capture(
        userDataDir || path.resolve(config.profilesDir, profileId),
        context || null,
        {
          profileId,
          tenantId,
          fingerprint,
        }
      );
      const platformCompatibility = PlatformCompatibilityService.evaluate(fingerprint);
      const runtimeMode = await RuntimeEnvironmentService.resolve({ tenantId, fingerprint });
      const sandboxRuntime = runtimeMode === 'sandbox' && tenantId
        ? await SandboxRuntimeEmulationService.getSettings(tenantId).catch(() => null)
        : null;
      const productionRuntime = runtimeMode === 'production' && tenantId
        ? await ProductionRuntimeEmulationService.getSettings(tenantId).catch(() => null)
        : null;
      const profileConsistency = tenantId
        ? await ProfileConsistencyService.getSummary(profileId, tenantId, runtimeMode).catch(() => null)
        : null;
      await fs.writeFile(snapshotPath, JSON.stringify({
        profileId,
        updatedAt: new Date().toISOString(),
        runtimeMode,
        fingerprintSummary: {
          userAgent: fingerprint?.userAgent || null,
          language: fingerprint?.language || null,
          timezoneId: fingerprint?.timezoneId || fingerprint?.timezone || null,
          screenResolution: fingerprint?.screenResolution || null
        },
        sessionPersistence: {
          ...sessionPersistence,
          contextMode: 'persistent_context',
          proxyBinding: proxy?.__session || null,
          sticky: Boolean(proxy?.__session?.sticky),
          country: proxy?.__session?.country || null,
          city: proxy?.__session?.city || null,
          endpointId: proxy?.__session?.endpointId || null,
        },
        platformCompatibility,
        profileConsistency,
        sandboxRuntime,
        productionRuntime,
      }, null, 2), 'utf8');
    } catch (error: any) {
      logger.warn('Failed to write profile session snapshot', { profileId, error: error?.message });
    }
  }

  private static async applyFingerprintToContext(context: BrowserContext, fingerprint: any, profileId: string, tenantId?: string | null) {
    if (!fingerprint) return;

    const payload = {
      hardwareConcurrency: fingerprint?.hardwareConcurrency,
      deviceMemory: fingerprint?.deviceMemory,
      platform: fingerprint?.platformOS || fingerprint?.platform,
      maxTouchPoints: fingerprint?.maxTouchPoints,
      canvasNoise: fingerprint?.canvas?.noise || null,
      webglVendor: fingerprint?.webgl?.vendor || fingerprint?.webglVendor || null,
      webglRenderer: fingerprint?.webgl?.renderer || fingerprint?.webglRenderer || null,
      screenWidth: (() => {
        const match = String(fingerprint?.screenResolution || '').match(/(\d+)\s*x\s*(\d+)/i);
        return match ? Number(match[1]) : undefined;
      })(),
      screenHeight: (() => {
        const match = String(fingerprint?.screenResolution || '').match(/(\d+)\s*x\s*(\d+)/i);
        return match ? Number(match[2]) : undefined;
      })(),
      audioSampleRate: fingerprint?.audio?.sampleRate || 44100,
      audioNoise: fingerprint?.audio?.noise || 0,
    };

    await context.addInitScript(FingerprintHardeningService.getStealthScript(profileId, payload));

    if (tenantId) {
      const runtimeMode = await RuntimeEnvironmentService.resolve({ tenantId, fingerprint });
      if (runtimeMode === 'sandbox') {
        const sandboxRuntime = await SandboxRuntimeEmulationService.getSettings(tenantId).catch(() => null);
        if (sandboxRuntime?.enabled) {
          const runtimePayload = SandboxRuntimeEmulationService.buildPayload(sandboxRuntime, fingerprint);
          await context.addInitScript((runtime: any) => {
            const hostname = String(location.hostname || '').toLowerCase();
            const safeHost = Array.isArray(runtime.allowedHosts) && runtime.allowedHosts.some((item: string) => {
              const normalized = String(item || '').toLowerCase();
              return normalized && (hostname === normalized || hostname.endsWith(`.${normalized}`));
            });
            if (!runtime.enabled || !safeHost) return;

            const minuteBucket = () => {
              const now = Date.now();
              const minMs = Math.max(1, Number(runtime.intervalMinMinutes || 3)) * 60 * 1000;
              return Math.floor(now / minMs);
            };
            const softDrift = () => Math.sin(minuteBucket() / 3) * 0.75;

            if (runtime.emulateWebRTC && 'RTCPeerConnection' in window) {
              const NativeRTCPeerConnection = (window as any).RTCPeerConnection;
              (window as any).RTCPeerConnection = class extends NativeRTCPeerConnection {
                addEventListener(type: string, listener: any, options?: any) {
                  if (type === 'icecandidate' && typeof listener === 'function') {
                    const wrapped = (event: any) => {
                      if (runtime.maskLocalIps && event?.candidate?.candidate) {
                        event.candidate.candidate = String(event.candidate.candidate).replace(/(\d{1,3}\.){3}\d{1,3}/g, '0.0.0.0');
                      }
                      listener(event);
                    };
                    return super.addEventListener(type, wrapped, options);
                  }
                  return super.addEventListener(type, listener, options);
                }
              };
            }

            if (runtime.emulateAudio) {
              const OriginalAudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
              if (OriginalAudioCtx) {
                (window as any).AudioContext = class extends OriginalAudioCtx {
                  createOscillator() {
                    const oscillator = super.createOscillator();
                    oscillator.frequency.value = oscillator.frequency.value + (runtime.audioNoise || 0) + softDrift();
                    return oscillator;
                  }
                };
              }
            }
          }, runtimePayload);
        }
      } else if (runtimeMode === 'production') {
        const productionRuntime = await ProductionRuntimeEmulationService.getSettings(tenantId).catch(() => null);
        if (productionRuntime?.enabled) {
          const runtimePayload = ProductionRuntimeEmulationService.buildPayload(productionRuntime, fingerprint);
          await context.addInitScript((runtime: any) => {
            const hostname = String(location.hostname || '').toLowerCase();
            const safeHost = Array.isArray(runtime.allowedHosts) && runtime.allowedHosts.some((item: string) => {
              const normalized = String(item || '').toLowerCase();
              return normalized && (hostname === normalized || hostname.endsWith(`.${normalized}`));
            });
            if (!runtime.enabled || !safeHost) return;

            if (runtime.emulateWebRTC && 'RTCPeerConnection' in window) {
              const NativeRTCPeerConnection = (window as any).RTCPeerConnection;
              (window as any).RTCPeerConnection = class extends NativeRTCPeerConnection {
                addEventListener(type: string, listener: any, options?: any) {
                  if (type === 'icecandidate' && typeof listener === 'function') {
                    const wrapped = (event: any) => {
                      if (runtime.maskLocalIps && event?.candidate?.candidate) {
                        event.candidate.candidate = String(event.candidate.candidate).replace(/(\d{1,3}\.){3}\d{1,3}/g, '0.0.0.0');
                      }
                      listener(event);
                    };
                    return super.addEventListener(type, wrapped, options);
                  }
                  return super.addEventListener(type, listener, options);
                }
              };
            }

            if (runtime.emulateAudio) {
              const OriginalAudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
              if (OriginalAudioCtx) {
                (window as any).AudioContext = class extends OriginalAudioCtx {
                  createOscillator() {
                    const oscillator = super.createOscillator();
                    oscillator.frequency.value = oscillator.frequency.value + (runtime.audioNoise || 0);
                    return oscillator;
                  }
                };
              }
            }
          }, runtimePayload);
        }
      }
    }
  }

  /**
   * Initialize or get the browser context with persistency
   */
  private static async getContext(profileId: string, fingerprint?: any, proxy?: any, storageState?: any) {
    const existing = this.activeContexts.get(profileId);
    if (existing) {
      this.clearIdleContextTimer(profileId);
      return existing;
    }

    await ProfileStateService.ensureProfileScaffold(profileId);
    await ProfileStateService.downloadFromCloud(profileId).catch(() => null);
    await MemoryAdmissionService.assertCapacity(`profile:${profileId}`);
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { tenantId: true }
    });
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }
    const hardenedFingerprint = this.hardenFingerprint(fingerprint);
    const consistency = await ProfileConsistencyService.stabilizeFingerprint(profileId, profile.tenantId, hardenedFingerprint);
    const stableFingerprint = consistency.fingerprint;
    await TenantCapacityService.assertCanRunProfile(profile.tenantId, profileId);
    const leaseToken = await ProfileStateService.acquireRuntimeLease(profileId);
    const userDataDir = path.resolve(config.profilesDir, profileId);
    let context: BrowserContext;
    try {
      await SessionPersistenceService.restore(userDataDir, {
        profileId,
        tenantId: profile.tenantId,
        fingerprint: stableFingerprint,
      }).catch(() => false);
      context = await chromium.launchPersistentContext(
        userDataDir,
        this.buildContextOptions(stableFingerprint, proxy)
      );

      // --- PHASE 3: STATE INJECTION (V4) ---
      if (storageState) {
        if (storageState.cookies) await context.addCookies(storageState.cookies);
        // localStorage is set per-page or per-context depending on Playwright version, 
        // but here we can handle it at the page level in createPage if needed.
      }
      await this.applyFingerprintToContext(context, stableFingerprint, profileId, profile.tenantId);

      await TenantCapacityService.registerActiveProfile(profile.tenantId, profileId, 2 * 60 * 1000);
      await ProfileConsistencyService.observeRuntime(profileId, profile.tenantId, stableFingerprint, proxy).catch(() => null);
    } catch (error) {
      await ProfileStateService.releaseRuntimeLease(profileId, leaseToken).catch(() => null);
      throw error;
    }
    this.activeContexts.set(profileId, context);
    this.activeProfileTenants.set(profileId, profile.tenantId);
    this.activeRuntimeLeases.set(profileId, leaseToken);
    const refreshTimer = setInterval(() => {
      const token = this.activeRuntimeLeases.get(profileId);
      const tenantId = this.activeProfileTenants.get(profileId);
      if (!token) return;
      ProfileStateService.refreshRuntimeLease(profileId, token).catch(() => null);
      if (tenantId) {
        TenantCapacityService.refreshActiveProfile(tenantId, profileId, 2 * 60 * 1000).catch(() => null);
      }
    }, 30000);
    this.runtimeLeaseIntervals.set(profileId, refreshTimer);
    context.on('close', () => {
      this.clearIdleContextTimer(profileId);
      this.activeContexts.delete(profileId);
      const token = this.activeRuntimeLeases.get(profileId);
      if (token) {
        ProfileStateService.releaseRuntimeLease(profileId, token).catch(() => null);
      }
      this.activeRuntimeLeases.delete(profileId);
      const tenantId = this.activeProfileTenants.get(profileId);
      if (tenantId) {
        TenantCapacityService.releaseActiveProfile(tenantId, profileId).catch(() => null);
      }
      this.activeProfileTenants.delete(profileId);
      const interval = this.runtimeLeaseIntervals.get(profileId);
      if (interval) clearInterval(interval);
      this.runtimeLeaseIntervals.delete(profileId);
      this.writeSessionSnapshot(profileId, stableFingerprint, proxy, null, userDataDir, profile.tenantId).catch(() => null);
      ProfileStateService.createSnapshot(profileId, 'context-close').catch(() => null);
      ProfileStateService.uploadToCloud(profileId).catch(() => null);
    });
    await this.writeSessionSnapshot(profileId, stableFingerprint, proxy, context, userDataDir, profile.tenantId);
    return context;
  }

  private static async getMicrosoftStage(page: Page): Promise<BrowserStage> {
    return BrowserStageService.detectMicrosoftStage(page);
  }

  private static async hasMicrosoftBirthSurface(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
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

      const selectorHit = selectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((el) => isVisible(el)));
      if (selectorHit) return true;

      const bodyText = normalize(document.body?.innerText || '');
      return /fecha de nacimiento|mes de nacimiento|dia de nacimiento|día de nacimiento|ano de nacimiento|año de nacimiento|pais o region|país o region|country or region|add some details/.test(bodyText);
    }).catch(() => false);
  }

  private static async hasMicrosoftProfileSurface(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
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

      const selectorHit = selectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((el) => isVisible(el)));
      if (selectorHit) return true;

      const bodyText = normalize(document.body?.innerText || '');
      return /agregar el nombre|agregue su nombre|add your name|your first name|your last name|first name|last name/.test(bodyText);
    }).catch(() => false);
  }

  private static async reconcileBirthStage(page: Page, initialStage: string, settleMs = 4500): Promise<'email' | 'password' | 'profile' | 'birth' | 'success' | 'captcha' | 'unknown'> {
    if (!['profile', 'unknown'].includes(initialStage)) {
      return initialStage as any;
    }

    let stage = initialStage;
    const startedAt = Date.now();
    while (Date.now() - startedAt < settleMs) {
      const birthSurfaceVisible = await this.hasMicrosoftBirthSurface(page);
      if (birthSurfaceVisible) {
        return 'birth';
      }

      await page.waitForTimeout(350).catch(() => {});
      stage = await this.getMicrosoftStage(page).catch(() => 'unknown');
      if (stage === 'birth' || stage === 'success' || stage === 'captcha') {
        return stage as any;
      }
    }

    return stage as any;
  }

  private static async shouldSkipPrematureBirthAdvance(page: Page, selector: string, stage: string, stepId?: string): Promise<boolean> {
    if (stage !== 'birth' || !BrowserPolicyService.isAdvanceButton(selector)) {
      return false;
    }

    const normalizedStepId = (stepId || '').toLowerCase();
    if (normalizedStepId.includes('profile_next') || normalizedStepId.includes('click_profile_next')) {
      return true;
    }

    return await page.evaluate(() => {
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
      const getControlText = (selector: string) => {
        const el = Array.from(document.querySelectorAll(selector)).find((node) => isVisible(node)) as HTMLElement | undefined;
        if (!el) return '';
        const input = el as HTMLInputElement;
        return normalize(input.value || el.innerText || el.textContent || el.getAttribute('aria-label') || '');
      };

      const monthText = getControlText('#BirthMonthDropdown, #BirthMonth, select[name="BirthMonth"], button[name="BirthMonth"], [aria-label*="Month"], [aria-label*="Mes"]');
      const dayText = getControlText('#BirthDayDropdown, #BirthDay, select[name="BirthDay"], button[name="BirthDay"], [aria-label*="Day"], [aria-label*="Dia"], [aria-label*="Día"]');
      const countryText = getControlText('#countryDropdownId, #Country, select[name="Country"], button[name="countryDropdownName"], [aria-label*="Country"], [aria-label*="Pais"], [aria-label*="País"]');
      const yearText = getControlText('#BirthYear, input[name="BirthYear"], #floatingLabelInput40, [aria-label*="Year"], [aria-label*="Ano"], [aria-label*="Año"]');

      const birthSurfaceVisible = !!(monthText || dayText || countryText || yearText);
      if (!birthSurfaceVisible) return false;

      const monthFilled = !!monthText && !/(month|mes|birth month)/.test(monthText);
      const dayFilled = !!dayText && !/(day|dia|d[íi]a|birth day)/.test(dayText);
      const countryFilled = !!countryText && !/(country|region|pais|país)/.test(countryText);
      const yearFilled = /^\d{4}$/.test(yearText);

      return !(monthFilled && dayFilled && countryFilled && yearFilled);
    }).catch(() => false);
  }

  private static async hasResolvedFieldSurface(page: Page, selector: string): Promise<boolean> {
    const fallbackSelectors = BrowserSelectorService.getFallbackSelectors(selector);
    for (const candidate of fallbackSelectors) {
      if (await page.isVisible(candidate).catch(() => false)) {
        return true;
      }
    }

    const expectedField = BrowserPolicyService.inferExpectedField(selector);
    if (expectedField === 'generic') {
      return false;
    }

    const semanticSelector = await this.inferSemanticFieldSelector(page, expectedField).catch(() => null);
    if (!semanticSelector) {
      return false;
    }

    return await page.isVisible(semanticSelector).catch(() => false);
  }

  private static async detectMicrosoftPressHoldInFrames(page: Page): Promise<{ frame: any; selector: string; durationMs: number } | null> {
    // Search ALL frames (main + iframes) for the press-and-hold button
    const allFrames = page.frames();

    logger.info(`[CAPTCHA-IFRAME-SCAN] Scanning ${allFrames.length} frame(s) for press-and-hold button...`);

    for (const frame of allFrames) {
      try {
        const frameUrl = frame.url();
        if (!frameUrl || frameUrl === 'about:blank') continue;

        const isChallengeFrame = /arkoselabs|funcaptcha|enforcement|hsprotect|perimeterx|captcha|challenge/i.test(frameUrl);

        const result = await frame.evaluate(() => {
          const isVisible = (el: Element | null) => {
            if (!el) return false;
            // We rely on the element's bounding box instead of the window size, as iframes might have 0 innerWidth temporarily.

            const node = el as HTMLElement;
            try {
              const style = window.getComputedStyle(node);
              const rect = node.getBoundingClientRect();
              
              // Viewport Guard: Ensure element is within valid interaction area (and not a 1x1 pixel)
              const withinViewport = 
                rect.width > 20 && 
                rect.height > 20 && 
                rect.left >= 0 && 
                rect.top >= 0 &&
                rect.left < window.innerWidth &&
                rect.top < window.innerHeight;

              return (
                style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                style.opacity !== '0' &&
                withinViewport
              );
            } catch { return false; }
          };

          const bodyText = (document.body?.innerText || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

          const bodyHtml = (document.body?.innerHTML || '').slice(0, 500);

          // Collect debug info about what's visible in this frame
          const allEls = Array.from(document.querySelectorAll('button, div, span, a, [role="button"]'));
          const visibleEls = allEls.filter(el => isVisible(el)).map(el => {
            const node = el as HTMLElement;
            const rect = node.getBoundingClientRect();
            return {
              tag: node.tagName.toLowerCase(),
              id: node.id || '',
              className: (node.className || '').toString().slice(0, 60),
              text: (node.textContent || '').trim().slice(0, 50),
              aria: node.getAttribute('aria-label') || '',
              role: node.getAttribute('role') || '',
              w: Math.round(rect.width),
              h: Math.round(rect.height),
            };
          });

          // ---- Strategy 1: Known selectors ----
          const candidateSelectors = [
            'button[aria-label*="mant"]',
            'button[aria-label*="press"]',
            'button[aria-label*="Hold"]',
            'button[aria-label*="Presiona"]',
            'button[aria-label*="pulsa"]',
            '[role="button"][aria-label*="mant"]',
            '[role="button"][aria-label*="press"]',
            '[role="button"][aria-label*="Hold"]',
            '[data-testid*="captcha"] button',
            '[data-testid*="challenge"] button',
            '#game-action-button',
            '#hipHoldButton',
            '#px-captcha',
            '#px-captcha-wrapper button',
            '#px-captcha-wrapper [role="button"]',
            '#px-captcha-wrapper div',
            'button.hip-action',
            'button.button--primary',
            'button.sc-nkuzb1-0',
            '[data-cmd="press"]',
            '[data-action="press"]',
          ];

          for (const selector of candidateSelectors) {
            const els = Array.from(document.querySelectorAll(selector));
            for (const el of els) {
              if (isVisible(el)) {
                const elId = (el as HTMLElement).id;
                const resolvedSelector = elId ? `#${elId}` : selector;
                return { selector: resolvedSelector, durationMs: 12000, bodyTextSnippet: bodyText.slice(0, 200), visibleEls };
              }
            }
          }

          // ---- Strategy 2: Text-based search on ALL interactive elements ----
          const interactiveEls = Array.from(document.querySelectorAll('button, [role="button"], a, div[tabindex], span[tabindex], div[onclick], div[class*="button"], div[class*="btn"]'));
          for (const el of interactiveEls) {
            if (!isVisible(el)) continue;
            const text = (el.textContent || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
            const aria = (el.getAttribute('aria-label') || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
            const combined = `${text} ${aria}`;
            if (/manten|press.*hold|presiona|pulsa|hold.*(button|boton)|boton.*manten|mantener/.test(combined)) {
              const elId = (el as HTMLElement).id;
              const tag = (el as HTMLElement).tagName.toLowerCase();
              const resolvedSelector = elId ? `#${elId}` : `${tag}`;
              return { selector: resolvedSelector, durationMs: 12000, bodyTextSnippet: bodyText.slice(0, 200), visibleEls };
            }
          }

          // ---- Strategy 3: PerimeterX-specific detection ----
          const pxCaptcha = document.querySelector('#px-captcha') as HTMLElement | null;
          if (pxCaptcha && isVisible(pxCaptcha)) {
            // Refinement: Try to find the actual button inside the container
            const innerButton = pxCaptcha.querySelector('button, [role="button"], div[onclick], div[class*="button"]');
            if (innerButton && isVisible(innerButton as HTMLElement)) {
                const elId = (innerButton as HTMLElement).id;
                const resolvedSelector = elId ? `#${elId}` : '#px-captcha button, #px-captcha [role="button"]';
                return { selector: resolvedSelector, durationMs: 12000, bodyTextSnippet: bodyText.slice(0, 200), visibleEls };
            }
            return { selector: '#px-captcha', durationMs: 12000, bodyTextSnippet: bodyText.slice(0, 200), visibleEls };
          }

          // ---- Strategy 4: ANY large clickable element in a challenge frame ----
          if (/enforcement|funcaptcha|arkoselabs|challenge|hsprotect|perimeterx|captcha/i.test(window.location.href)) {
            for (const el of allEls) {
              if (!isVisible(el)) continue;
              const rect = (el as HTMLElement).getBoundingClientRect();
              if (rect.width > 100 && rect.height > 40) {
                const elId = (el as HTMLElement).id;
                const tag = (el as HTMLElement).tagName.toLowerCase();
                const resolvedSelector = elId ? `#${elId}` : tag;
                return { selector: resolvedSelector, durationMs: 12000, bodyTextSnippet: bodyText.slice(0, 200), visibleEls };
              }
            }
          }

          // Return debug info even when not found
          return { selector: '', durationMs: 0, bodyTextSnippet: bodyText.slice(0, 300), visibleEls, htmlSnippet: bodyHtml };
        }).catch((e: any) => ({ selector: '', durationMs: 0, bodyTextSnippet: '', visibleEls: [] as any[], error: e?.message?.slice(0, 100) }));

        if (result && result.selector) {
          logger.info('[CAPTCHA-IFRAME-SCAN] Press-and-hold element found!', {
            frameUrl: frameUrl.slice(0, 120),
            isChallengeFrame,
            selector: result.selector,
            bodyTextSnippet: result.bodyTextSnippet,
          });
          return { frame, selector: result.selector, durationMs: result.durationMs };
        }

        // Log frame contents for debugging (only for non-trivial frames)
        if (result && (isChallengeFrame || (result.visibleEls && result.visibleEls.length > 0))) {
          logger.info('[CAPTCHA-IFRAME-SCAN] Frame inspected (no match).', {
            frameUrl: frameUrl.slice(0, 120),
            isChallengeFrame,
            bodyTextSnippet: result.bodyTextSnippet?.slice(0, 150),
            visibleElCount: result.visibleEls?.length || 0,
            visibleEls: (result.visibleEls || []).slice(0, 8),
            htmlSnippet: (result as any).htmlSnippet?.slice(0, 200),
            error: (result as any).error,
          });
        }
      } catch (e: any) {
        logger.warn('[CAPTCHA-IFRAME-SCAN] Frame evaluation failed.', { error: e?.message?.slice(0, 100) });
        continue;
      }
    }

    // Summary log
    const frameUrls = allFrames.map(f => f.url()).filter(u => u && u !== 'about:blank');
    logger.info('[CAPTCHA-IFRAME-SCAN] No press-and-hold element found in any frame.', {
      frameCount: allFrames.length,
      frameUrls: frameUrls.map(u => u.slice(0, 100)),
    });

    return null;
  }

  private static async solveArkoseAudioChallenge(page: Page): Promise<boolean> {
    logger.info('[ARKOSE-AUDIO] Scanning for Arkose audio challenge...');
    try {
      // Arkose loads many nested iframes. We scan all frames for the Audio/Accessibility button.
      const frames = page.frames();
      let audioBtnFrame: any = null;
      let audioBtnLocator: any = null;

      for (const frame of frames) {
        try {
          // Playwright locator for the Audio Challenge icon/button
          const locator = frame.locator('button[title*="udio"], button[aria-label*="udio"], #fc-ui-audio-button, button#audio_challenge').first();
          if (await locator.isVisible({ timeout: 1000 }).catch(() => false)) {
            audioBtnFrame = frame;
            audioBtnLocator = locator;
            break;
          }
        } catch (e) {}
      }

      if (!audioBtnLocator) {
        logger.info('[ARKOSE-AUDIO] No Audio Challenge button found. Emitting Arkose as unresolved.');
        return false;
      }

      logger.info('[ARKOSE-AUDIO] Found Arkose Audio accessibility button. Clicking...');
      await audioBtnLocator.click({ delay: 150 + Math.random() * 200 });

      // Wait for the "Play" button or the Audio puzzle UI to appear
      await page.waitForTimeout(1500 + Math.random() * 1000);

      const playBtnOrLink = audioBtnFrame.locator('#audio-play, .audio-play, a[href*=".wav"], button:has-text("Play")').first();
      await playBtnOrLink.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);

      // Now we need the .wav URL. Sometimes it's in the DOM, sometimes we have to intercept it.
      let audioUrl = '';
      
      const linkLocator = audioBtnFrame.locator('a[href*=".wav"], a[href*=".mp3"]').first();
      if (await linkLocator.isVisible().catch(() => false)) {
        audioUrl = await linkLocator.getAttribute('href');
      }

      if (!audioUrl) {
        // If not in DOM, we click play and intercept the network request
        logger.info('[ARKOSE-AUDIO] Audio link not in DOM. Intercepting network stream...');
        const responsePromise = page.waitForResponse((response: any) => 
          response.url().includes('arkoselabs.com') && (response.url().includes('.wav') || response.url().includes('.mp3')),
          { timeout: 7000 }
        ).then((res: any) => res.url()).catch(() => '');

        const playBtn = audioBtnFrame.locator('#audio-play, button:has-text("Play")').first();
        if (await playBtn.isVisible().catch(() => false)) {
           await playBtn.click();
        }

        audioUrl = await responsePromise;
      }

      if (!audioUrl) {
        logger.warn('[ARKOSE-AUDIO] Failed to intercept Arkose audio URL.');
        return false;
      }

      logger.info(`[ARKOSE-AUDIO] Successfully extracted Audio Payload URL: ${audioUrl.split('?')[0]}`);

      // Download the audio file using the browser context (to preserve cookies/auth)
      const response = await page.request.get(audioUrl);
      const buffer = await response.body();
      
      const tmpFile = path.resolve(process.cwd(), `arkose_challenge_${Date.now()}.wav`);
      await fs.writeFile(tmpFile, buffer);

      logger.info(`[ARKOSE-AUDIO] Audio file downloaded (${buffer.length} bytes). Transcribing via Speech-to-Text...`);
      
      const transcribedText = await LocalAudioCaptchaService.transcribeAudio(tmpFile);
      
      await fs.unlink(tmpFile).catch(() => {}); // cleanup

      if (!transcribedText || transcribedText.trim() === '') {
        logger.warn('[ARKOSE-AUDIO] Transcription returned empty or failed.');
        return false;
      }

      logger.info(`[ARKOSE-AUDIO] Transcription Result: "${transcribedText}". Injecting into Arkose...`);

      // Locate the input box and type the decoded challenge
      const input = audioBtnFrame.locator('input[type="text"], input#audio-response').first();
      await input.waitFor({ state: 'visible', timeout: 3000 });
      await input.fill(transcribedText);

      // Submit
      await page.waitForTimeout(500 + Math.random() * 500);
      const submitBtn = audioBtnFrame.locator('button:has-text("Verify"), button[type="submit"], #audio-submit').first();
      await submitBtn.click();

      // Wait 5 seconds to let the challenge verification finish and navigation to occur
      await page.waitForTimeout(5000);
      const postStage = await this.getMicrosoftStage(page).catch(() => 'unknown');
      
      if (postStage !== 'captcha') {
        logger.info('[ARKOSE-AUDIO] 🎉 SUCCESS! Arkose Challenge bypassed natively!');
        return true;
      } else {
        logger.warn('[ARKOSE-AUDIO] Transcription was rejected by Arkose.');
        return false;
      }

    } catch (error: any) {
      logger.warn('[ARKOSE-AUDIO] Exception during Arkose audio bypass.', { error: error?.message });
      return false;
    }
  }

  // --- ADVANCED HUMAN-MIMETIC MOUSE CONTROLS (PERIMETER-X / HUMAN SECURITY BYPASS) --- //

  private static async bezierMove(page: Page, startX: number, startY: number, endX: number, endY: number, steps: number = 25) {
    // Generate a random control point for the Bezier curve
    const cpX = startX + (endX - startX) * Math.random() + (Math.random() - 0.5) * 150;
    const cpY = startY + (endY - startY) * Math.random() + (Math.random() - 0.5) * 150;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Easing out cubic: t = 1 - Math.pow(1 - t, 3) makes it slow down at the end
      const easeT = 1 - Math.pow(1 - t, 3);
      
      const x = Math.pow(1 - easeT, 2) * startX + 2 * (1 - easeT) * easeT * cpX + Math.pow(easeT, 2) * endX;
      const y = Math.pow(1 - easeT, 2) * startY + 2 * (1 - easeT) * easeT * cpY + Math.pow(easeT, 2) * endY;
      
      // GRANULARITY: Playwright's native interpolator fills in the microscopic gaps between curve points
      await page.mouse.move(x, y, { steps: 2 + Math.floor(Math.random() * 3) });
      
      // Speed jitter: humans don't move at a mathematically perfect curved speed
      const speedJitter = (Math.random() - 0.5) * 10;
      const delay = Math.max(5, 15 + Math.random() * 15 + (t < 0.2 || t > 0.8 ? 15 : 0) + speedJitter);
      await page.waitForTimeout(delay);
    }
  }

  private static async microTremor(page: Page, x: number, y: number, durationMs: number) {
    const startTime = Date.now();
    let currentX = x;
    let currentY = y;
    
    // Perlin-like drifting noise
    let noiseX = Math.random() * Math.PI * 2;
    let noiseY = Math.random() * Math.PI * 2;
    
    // Organic drift: add a very slow random walk to simulate hand fatigue/vibration
    let driftX = 0;
    let driftY = 0;
    
    while (Date.now() - startTime < durationMs) {
      noiseX += (Math.random() - 0.5) * 0.8;
      noiseY += (Math.random() - 0.5) * 0.8;
      
      // Drift accumulation (slow random walk)
      driftX += (Math.random() - 0.5) * 0.2;
      driftY += (Math.random() - 0.5) * 0.2;
      // Clamp drift to 3px to stay on button
      driftX = Math.max(-3, Math.min(3, driftX));
      driftY = Math.max(-3, Math.min(3, driftY));
      
      const offsetX = Math.sin(noiseX) * 0.45 + driftX;
      const offsetY = Math.cos(noiseY) * 0.45 + driftY;
      
      currentX = x + offsetX;
      currentY = y + offsetY;
      
      // Move using small steps
      await page.mouse.move(currentX, currentY, { steps: 2 });
      
      // Physiological frequency (8-15Hz). Wait between 60ms and 110ms.
      await page.waitForTimeout(65 + Math.random() * 45);
    }
  }

  private static async pressAndHoldInFrame(frame: any, selector: string, durationMs: number): Promise<{ success: boolean; x?: number; y?: number }> {
    const holdMs = Math.max(100, Number(durationMs) || 0);

    // Strategy 1 (PRIMARY): Use Playwright's native mouse API with Advanced Human Mimicry
    try {
      const locator = frame.locator(selector).first();
      // Wait to ensure bounding box is completely ready (PerimeterX often shifts layout)
      await frame.waitForTimeout(400 + Math.random() * 300); 
      const box = await locator.boundingBox().catch(() => null);
      
      if (box) {
        const page = frame.page();
        
        // 1. Determine starting position (Coming from a random off-screen area)
        const startX = Math.random() > 0.5 ? -50 : (page.viewportSize()?.width || 1280) + 50;
        const startY = Math.random() * (page.viewportSize()?.height || 720);
        
        // Instead of teleporting, move naturally from the "edge" towards the center area
        const prepX = 100 + Math.random() * 200;
        const prepY = 100 + Math.random() * 200;
        await this.bezierMove(page, startX, startY, prepX, prepY, 15 + Math.floor(Math.random() * 10));
        await page.waitForTimeout(200 + Math.random() * 400);

        // 2. Target area (DOM Base)
        let targetX = box.x + box.width / 2;
        let targetY = box.y + box.height / 2;

        // OBSIDIAN VISION (Mimetic 3.3): Vision-Augmented Calibration
        // We use YOLO to double-check the center of the button on the actual screen
        if (LocalVisionCaptchaService.isEnabled() && LocalVisionCaptchaService.getHealthReport().modelExists) {
          const screenshotPath = path.resolve(process.cwd(), `vision_calib_${Date.now()}.png`);
          try {
            await page.screenshot({ path: screenshotPath });
            const visionTarget = await LocalVisionCaptchaService.detectPrimaryTarget(screenshotPath);
            if (visionTarget && visionTarget.bbox) {
              const visionCenterX = (visionTarget.bbox[0] + visionTarget.bbox[2]) / 2;
              const visionCenterY = (visionTarget.bbox[1] + visionTarget.bbox[3]) / 2;
              
              const dist = Math.sqrt(Math.pow(visionCenterX - targetX, 2) + Math.pow(visionCenterY - targetY, 2));
              
              const isPreferred = ['press_hold', 'captcha', 'button', 'checkbox'].includes(String(visionTarget.label || '').toLowerCase());
              // Only override if the detected object is close to the DOM element (e.g. inside the container)
              // or if it's a specifically trained captcha label. Don't click random "cell phones" 200px away.
              const maxDist = isPreferred ? 350 : 80;

              if (dist < maxDist && visionTarget.confidence > 0.4) { 
                logger.info('[CAPTCHA-SOLVER] 🎯 Vision calibration active! Refined coordinates via YOLO.', {
                  dom: { x: Math.round(targetX), y: Math.round(targetY) },
                  vision: { x: Math.round(visionCenterX), y: Math.round(visionCenterY) },
                  dist: Math.round(dist),
                  conf: visionTarget.confidence,
                  label: visionTarget.label
                });
                targetX = visionCenterX;
                targetY = visionCenterY;
              } else {
                logger.info('[CAPTCHA-SOLVER] ⚠️ Vision calibration ignored (Dist too high for generic label).', { dist, maxDist, conf: visionTarget.confidence, label: visionTarget.label });
              }
            }
          } catch (e) {
            logger.warn('[CAPTCHA-SOLVER] Vision calibration failed. Falling back to DOM.', { error: (e as Error).message });
          } finally {
            await fs.unlink(screenshotPath).catch(() => {});
          }
        }

        // Add slight randomization to refined target
        const jitterX = (Math.random() - 0.5) * box.width * 0.15; // Tightened jitter
        const jitterY = (Math.random() - 0.5) * box.height * 0.15;
        targetX += jitterX;
        targetY += jitterY;

        logger.info('[CAPTCHA-SOLVER] Executing Advanced Human-Mimetic native mouse approach (Obsidian Vision).', {
          selector, holdMs, targetX: Math.round(targetX), targetY: Math.round(targetY)
        });

        // 3. Move towards target with OVERSHOOT (human error)
        const steps = 20 + Math.floor(Math.random() * 15);
        const overshootX = targetX + (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 15);
        const overshootY = targetY + (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 15);
        await this.bezierMove(page, prepX, prepY, overshootX, overshootY, steps);
        
        // OBSIDIDAN ARMOR (Mimetic 3.2): "Scan-and-Pounce" Pattern
        // Move across the hit-area once to "check" the button bounds like a human would
        const sweepX = targetX + (Math.random() > 0.5 ? 1 : -1) * 20;
        const sweepY = targetY + (Math.random() > 0.5 ? 1 : -1) * 20;
        await this.bezierMove(page, overshootX, overshootY, sweepX, sweepY, 12);
        await page.waitForTimeout(180 + Math.random() * 200);
        
        // Correct back into the exact target area (the "pounce")
        await this.bezierMove(page, sweepX, sweepY, targetX, targetY, 8 + Math.floor(Math.random() * 5));
        
        // 4. Pausa antes del click (micro-hesitation)
        await page.waitForTimeout(400 + Math.random() * 600);
        
        // OBSIDIAN ARMOR (Mimetic 3.2): Recursive Frame Focus
        // We focus the iframe container in the parent page AND the element inside
        try {
          const iframeHandle = await (frame as any).frameElement();
          if (iframeHandle) await iframeHandle.focus();
        } catch (e) {}
        await frame.focus(selector).catch(() => null);
        await page.waitForTimeout(300 + Math.random() * 400);

        // 6. Hold and monitor for success
        const startTime = Date.now();
        logger.info('[CAPTCHA-SOLVER] Mouse button is DOWN. Monitoring for challenge completion...', { holdMs });
        
        await page.mouse.down();

        // OBSIDIAN ARMOR V3: Optical Sensor Quantization & Hardware Deadzone Simulation
        // Humans do not emit 60Hz continuous floating-point `mousemove` events while holding a button.
        // Hardware mice have DPI thresholds; they only emit events when physical movement exceeds an integer pixel threshold.
        // We will accumulate biological sub-pixel tremor, and ONLY fire an integer pixel jump when it spills over.
        let noiseX = Math.random() * Math.PI * 2;
        let noiseY = Math.random() * Math.PI * 2;
        let driftX = 0;
        let driftY = 0;
        
        let lastReportedX = Math.round(targetX);
        let lastReportedY = Math.round(targetY);
        
        let solved = false;
        
        const visibilityChecker = setInterval(() => {
          locator.isVisible().then(vis => { if (!vis) solved = true; }).catch(() => { solved = true; });
        }, 500);

        while (Date.now() - startTime < holdMs && !solved) {
          // Accumulate raw internal biological noise
          noiseX += (Math.random() - 0.5) * 0.4;
          noiseY += (Math.random() - 0.5) * 0.4;
          
          driftX += (Math.random() - 0.5) * 0.1;
          driftY += (Math.random() - 0.5) * 0.1;
          
          // Clamp absolute drift
          driftX = Math.max(-2, Math.min(2, driftX));
          driftY = Math.max(-2, Math.min(2, driftY));
          
          const idealX = targetX + Math.sin(noiseX) * 0.5 + driftX;
          const idealY = targetY + Math.cos(noiseY) * 0.5 + driftY;
          
          // Hardware DPI Quantization (Convert to integer pixel grid)
          const quantizedX = Math.round(idealX);
          const quantizedY = Math.round(idealY);
          
          // Only dispatch CDP events IF the sensor grid detects a 1-pixel shift
          if (quantizedX !== lastReportedX || quantizedY !== lastReportedY) {
              await page.mouse.move(quantizedX, quantizedY, { steps: 1 });
              lastReportedX = quantizedX;
              lastReportedY = quantizedY;
          }
          
          // Yield to browser (approx 30-50ms tick rate)
          await page.waitForTimeout(30 + Math.random() * 20);
        }
        
        clearInterval(visibilityChecker);
        
        if (solved) {
          logger.info('[CAPTCHA-SOLVER] 🎉 ELEMENT VANISHED during hold. Releasing early!');
        }
        
        // 7. Up!
        await page.mouse.up();
        
        // 8. Human-like "Result Verification" settle (stay on button briefly after release)
        const postReleaseSettle = 1200 + Math.random() * 1800;
        await page.waitForTimeout(postReleaseSettle);
        
        // 9. Slight move away after release (natural follow-through)
        await page.mouse.move(targetX + (Math.random()-0.5)*40, targetY + (Math.random()-0.5)*40, { steps: 8 + Math.floor(Math.random() * 5) });
        
        logger.info('[CAPTCHA-SOLVER] Mouse button is UP. Press-and-hold completed.', { selector });
        return { success: true, x: targetX, y: targetY };
      } else {
        logger.warn('[CAPTCHA-SOLVER] boundingBox() returned null for selector in frame.', { selector });
      }
    } catch (e: any) {
      logger.warn('[CAPTCHA-SOLVER] Native mouse strategy failed.', { error: e.message?.slice(0, 100) });
    }

    return { success: false };
  }

  private static async attemptLocalVisionMouseHold(page: Page): Promise<boolean> {
    const screenshotPath = path.resolve(process.cwd(), `yolo_captcha_${Date.now()}.png`);

    try {
      await page.screenshot({ path: screenshotPath });
      const target = await LocalVisionCaptchaService.detectPrimaryTarget(screenshotPath);
      if (!target) {
        return false;
      }

      const centerX = Math.round((target.bbox[0] + target.bbox[2]) / 2);
      const centerY = Math.round((target.bbox[1] + target.bbox[3]) / 2);

      logger.info('[YOLO-CAPTCHA] Local vision target acquired.', {
        label: target.label,
        confidence: target.confidence,
        centerX,
        centerY,
      });

      await this.bezierMove(
        page,
        Math.random() * 300 + 50,
        Math.random() * 220 + 50,
        centerX,
        centerY,
        18
      );
      await page.waitForTimeout(420 + Math.random() * 360);
      await page.mouse.down();

      const holdSlices = 10;
      const baseSliceDelay = 900 + Math.random() * 350;
      for (let i = 0; i < holdSlices; i++) {
        const driftX = centerX + (Math.random() - 0.5) * 6;
        const driftY = centerY + (Math.random() - 0.5) * 6;
        await page.mouse.move(driftX, driftY, { steps: 2 + Math.floor(Math.random() * 3) });
        await page.waitForTimeout(baseSliceDelay + (Math.random() - 0.5) * 180);
      }

      await page.mouse.up();
      await page.waitForTimeout(2800 + Math.random() * 1600);

      const postStage = await this.getMicrosoftStage(page).catch(() => 'unknown');
      return postStage !== 'captcha';
    } catch (error: any) {
      logger.warn('[YOLO-CAPTCHA] Local vision attempt failed.', {
        error: error?.message,
      });
      return false;
    } finally {
      await fs.unlink(screenshotPath).catch(() => {});
    }
  }

  private static async waitForManualChallengeResolution(page: Page, timeout = 180000): Promise<boolean> {
    logger.warn('[MANUAL-CHALLENGE] Verification challenge detected. Applying runtime policy for safe handling.', {
      timeoutMs: timeout,
      policy: CaptchaRuntimePolicyService.getHealthReport(),
    });

    let autoAttempted = false;
    let visionAttempted = false;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      const stage = await this.getMicrosoftStage(page).catch(() => 'unknown');
      if (stage !== 'captcha') {
        logger.info('[MANUAL-CHALLENGE] Human verification cleared. Resuming automated flow.', { stage });
        return true;
      }

      if (!autoAttempted) {
        // Wait a bit for iframes and scripts to fully hydrate
        await page.waitForTimeout(4000 + Math.random() * 2000);

        if (!visionAttempted && CaptchaRuntimePolicyService.allowLocalVisionForExternalChallenge()) {
          visionAttempted = true;
          const localVisionSolved = await this.attemptLocalVisionMouseHold(page).catch(() => false);
          if (localVisionSolved) {
            logger.info('[YOLO-CAPTCHA] Local vision interaction path completed the challenge.');
            return true;
          }
        }

        if (!CaptchaRuntimePolicyService.allowExternalChallengeAutomation()) {
          logger.warn('[MANUAL-CHALLENGE] External challenge automation (APIs) is disabled by policy. Proceeding with local mimetic strategies only.');
        }

        // Try Arkose Audio solver first. If it succeeds, we are done!
        const arkoseSolved = await this.solveArkoseAudioChallenge(page);
        if (arkoseSolved) {
           logger.info('[CAPTCHA-SOLVER] Native Open-Source Audio AI successfully unblocked the flow!');
           return true;
        }

        const pressHold = await this.detectMicrosoftPressHoldInFrames(page);
        if (pressHold) {
          logger.info('[CAPTCHA-SOLVER] Press-and-hold element found! Starting resolution sequence...', {
            selector: pressHold.selector,
          });

          // --- EXTERNAL AUTO-SOLVER INTEGRATION (CAPSOLVER / 2CAPTCHA) --- //
          const frameUrl = pressHold.frame.url();
          // Extract the site key from the iframe URL (e.g. app_id=PXzC5j78di)
          const match = frameUrl.match(/app_id=([^&]+)/);
          const appId = match ? match[1] : null;

          if (appId && ThirdPartyCaptchaService.isEnabled()) {
            logger.info('[CAPTCHA-SOLVER] Offloading PerimeterX challenge to ThirdPartyCaptchaService...', { appId });
            
            // It will poll the 3rd party API (takes ~15-60s)
            const resolvedPxToken = await ThirdPartyCaptchaService.solvePerimeterX(page.url(), appId);
            
            if (resolvedPxToken) {
              logger.info('[CAPTCHA-SOLVER] Offloading successful! Injecting _px3 cookie...');
              
              let cookieValue = resolvedPxToken;
              if (resolvedPxToken.includes('=')) {
                // simple parse if it returns a set-cookie string like "_px3=asdf123;"
                const parts = resolvedPxToken.split(';')[0].split('=');
                if (parts.length >= 2) cookieValue = parts[1];
              }

              // Inject the cookie
              await page.context().addCookies([{
                name: '_px3',
                value: cookieValue,
                domain: '.live.com',
                path: '/'
              }]);
              
              logger.info('[CAPTCHA-SOLVER] Cookie injected. Refreshing page to clear challenge...');
              await page.reload({ waitUntil: 'domcontentloaded' });
              await page.waitForTimeout(5000);

              const postStage = await this.getMicrosoftStage(page).catch(() => 'unknown');
              if (postStage !== 'captcha') {
                logger.info('[CAPTCHA-SOLVER] 🎉 SUCCESS via Third-Party API!');
                return true;
              } else {
                logger.warn('[CAPTCHA-SOLVER] Reloaded with cookie but still in captcha. Resuming local mimetic approach.');
              }
            } else {
              logger.warn('[CAPTCHA-SOLVER] ThirdParty service failed to solve. Falling back to mimetic mouse strategy.');
            }
          }

          // --- MIMETIC NATIVE MOUSE STRATEGY (FALLBACK) --- //
          // ARMOR MODE: Intensive Pre-flight Warm-up (10-15s of human-like noise)
          logger.info('[CAPTCHA-SOLVER] Armoring session: Performing intensive pre-flight warm-up...');
          for (let w = 0; w < 5; w++) {
            const viewport = page.viewportSize() || { width: 1280, height: 720 };
            await this.bezierMove(page, 
              Math.random() * (viewport.width - 200) + 100, Math.random() * (viewport.height - 200) + 100, 
              Math.random() * (viewport.width - 200) + 100, Math.random() * (viewport.height - 200) + 100, 
              20 + Math.floor(Math.random() * 20)
            );
            await page.waitForTimeout(800 + Math.random() * 1200);
          }

          // Anti-bot systems often track how many times you retry. We do up to 10 attempts.
          const MAX_ATTEMPTS = 10;
          for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            try {
              // OBSIDIAN ARMOR (Mimetic 3.2): Aggressive scaling
              // We scale up to 18.5s if needed to break the silent flag
              const baseHold = attempt < 2 ? 4000 : (attempt < 5 ? 8000 : 13000);
              const dynamicHoldMs = baseHold + (attempt * 1200) + (Math.random() * 4000);

              logger.info(`[CAPTCHA-SOLVER] Attempt ${attempt + 1}/${MAX_ATTEMPTS}: Requesting dynamic hold of ${Math.round(dynamicHoldMs)}ms (Obsidian Armor)`);

              // Press and hold inside the frame
              const res = await this.pressAndHoldInFrame(pressHold.frame, pressHold.selector, dynamicHoldMs);
              if (!res.success) {
                logger.warn(`[CAPTCHA-SOLVER] Attempt ${attempt + 1}/${MAX_ATTEMPTS}: pressAndHoldInFrame returned false.`);
                continue;
              }

              // Post-click settling: wait to see if the challenge clears
              const settleTime = 4000 + Math.random() * 4000;
              logger.info(`[CAPTCHA-SOLVER] Post-interaction interactive settle (${Math.round(settleTime)}ms)...`);
              
              // Instead of a dead wait, we perform "breathing" micro-movements
              const settleSteps = 5 + Math.floor(Math.random() * 5);
              for (let s = 0; s < settleSteps; s++) {
                const stepDelay = settleTime / settleSteps;
                const jitterX = (Math.random() - 0.5) * 15;
                const jitterY = (Math.random() - 0.5) * 15;
                if (res.x !== undefined && res.y !== undefined) {
                  await page.mouse.move(res.x + jitterX, res.y + jitterY, { steps: 5 }).catch(() => null);
                }
                await page.waitForTimeout(stepDelay);
              }

              const postStage = await this.getMicrosoftStage(page).catch(() => 'unknown');
              if (postStage !== 'captcha') {
                logger.info('[CAPTCHA-SOLVER] 🎉 SUCCESS! Challenge bypassed in Armor Mode!', {
                  attempt: attempt + 1,
                  newStage: postStage,
                });
                return true;
              }

              // ARMOR MODE: Strategy Switching & UI Freeze Recovery
              if (attempt === 3) {
                logger.warn('[CAPTCHA-SOLVER] Attempt 4: Probing for Microsoft UI Freeze (Soft Reload)...');
                await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => null);
                await page.waitForTimeout(5000);
                
                const checkStage = await this.getMicrosoftStage(page).catch(() => 'unknown');
                if (checkStage !== 'captcha') {
                  logger.info('[CAPTCHA-SOLVER] 🎉 SUCCESS! Challenge was already cleared but UI hung. Resuming flow!!');
                  await this.hydrateIdentityRescue(page).catch(() => {});
                  return true;
                }

                logger.warn('[CAPTCHA-SOLVER] Still in captcha. Switching to DOM-Native hybrid strategy.');
                const loc = pressHold.frame.locator(pressHold.selector).first();
                await loc.scrollIntoViewIfNeeded().catch(() => null);
              }
              
              if (attempt === 6) {
                logger.warn('[CAPTCHA-SOLVER] Attempt 7: Re-loading challenge iframe only (Non-destructive).');
                try {
                  const frameUrl = pressHold.frame.url();
                  await pressHold.frame.goto(frameUrl, { waitUntil: 'domcontentloaded' }).catch(() => null);
                } catch (e) {}
                await page.waitForTimeout(5000);
              }

              if (attempt === 8) {
                logger.warn('[CAPTCHA-SOLVER] Attempt 9: Failsafe triggered. Performing Hard Context Reset (Full Page Refresh).');
                await page.reload({ waitUntil: 'networkidle' }).catch(() => null);
                await page.waitForTimeout(6000);
                return false; // Exit to re-trigger the entire handler from the beginning
              }

              logger.warn(`[CAPTCHA-SOLVER] Attempt ${attempt + 1}/${MAX_ATTEMPTS} failed to clear captcha. Retrying...`);

              // Re-detect in case iframe reloaded or shifted
              const reDetected = await this.detectMicrosoftPressHoldInFrames(page);
              if (reDetected) {
                pressHold.frame = reDetected.frame;
                pressHold.selector = reDetected.selector;
              }
              
              // Variable backoff before next attempt (humans take breaks)
              await page.waitForTimeout(2000 + Math.random() * 4000);


              await page.waitForTimeout(2000 + Math.random() * 2000);
            } catch (e: any) {
              logger.warn(`[CAPTCHA-AUTO-RESOLVE] Attempt ${attempt + 1}/3 failed: ${e.message}`);
            }
          }

          autoAttempted = true;
          logger.warn('[CAPTCHA-AUTO-RESOLVE] All auto-resolution attempts exhausted. Falling back to manual wait.');
        } else {
          // PerimeterX button not found. It might be Arkose, or it might still be loading.
          // Do NOT set autoAttempted = true forever. We will retry scanning in 5 seconds.
          logger.warn('[MANUAL-CHALLENGE] No press-and-hold button found in any frame yet. Will retry scanning...');
          await page.waitForTimeout(5000);
          continue; // Skips setting autoAttempted to true, allowing the loop to try detectMicrosoftPressHoldInFrames again
        }
      }

      await page.waitForTimeout(2000).catch(() => {});
    }

    return false;
  }

  private static async restoreEmailStage(page: Page, cachedEmail?: string | null) {
    return BrowserRecoveryService.restoreEmailStage(page, cachedEmail);
  }

  private static isEmailLike(value: string) {
    const candidate = (value || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate);
  }

  private static splitEmailParts(value: string) {
    const candidate = (value || '').trim();
    const atIndex = candidate.indexOf('@');
    if (atIndex <= 0) {
      return {
        localPart: candidate,
        domain: ''
      };
    }

    return {
      localPart: candidate.slice(0, atIndex),
      domain: candidate.slice(atIndex)
    };
  }

  private static async detectCompoundEmailDomainSelector(page: Page, inputSelector: string): Promise<string | null> {
    return await page.evaluate((selector) => {
      const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isVisible = (el: Element | null) => {
        if (!el) return false;
        const node = el as HTMLElement;
        const style = window.getComputedStyle(node);
        return style.visibility !== 'hidden' && style.display !== 'none' && node.offsetWidth > 0 && node.offsetHeight > 0;
      };

      const input = document.querySelector(selector);
      if (!input) return null;
      const inputBox = (input as HTMLElement).getBoundingClientRect();

      const explicitSelectors = [
        '#LiveDomainBox',
        'select[name*="Domain"]',
        'select[id*="Domain"]',
        'button[aria-haspopup="listbox"]',
        '[role="combobox"]'
      ];

      for (const candidateSelector of explicitSelectors) {
        const candidate = document.querySelector(candidateSelector);
        if (!candidate || !isVisible(candidate)) continue;
        const box = (candidate as HTMLElement).getBoundingClientRect();
        const searchable = [
          normalize(candidate.getAttribute('name')),
          normalize(candidate.getAttribute('aria-label')),
          normalize(candidate.textContent),
          normalize((candidate as HTMLInputElement).value),
          normalize((candidate as HTMLElement).id)
        ].join(' ');

        if (!/@hotmail\.com|@outlook\.com|hotmail|outlook|domain/.test(searchable)) continue;
        const sameRow = Math.abs(box.top - inputBox.top) < Math.max(40, inputBox.height);
        const toRight = box.left >= inputBox.right - 8;
        if (!sameRow && !toRight) continue;
        return candidateSelector;
      }

      const containerCandidates: Element[] = [];
      let cursor: Element | null = input.parentElement;
      for (let depth = 0; cursor && depth < 4; depth += 1) {
        containerCandidates.push(cursor);
        cursor = cursor.parentElement;
      }

      const fallbackContainer = containerCandidates[0] || document.body;
      const searchRoots = [...containerCandidates, fallbackContainer];

      let bestMatch: { selector: string; score: number } | null = null;

      for (const root of searchRoots) {
        const nodes = Array.from(root.querySelectorAll('select, [role="combobox"], button[aria-haspopup="listbox"], button, input[list]'));
        for (const node of nodes) {
          if (node === input || !isVisible(node)) continue;
          const tag = node.tagName.toLowerCase();
          const role = normalize(node.getAttribute('role'));
          const name = normalize(node.getAttribute('name'));
          const aria = normalize(node.getAttribute('aria-label'));
          const text = normalize(node.textContent);
          const value = normalize((node as HTMLInputElement).value);
          const searchable = [tag, role, name, aria, text, value].join(' ');

          if (!/@hotmail\.com|@outlook\.com|hotmail|outlook/.test(searchable)) continue;
          const box = (node as HTMLElement).getBoundingClientRect();
          const sameRow = Math.abs(box.top - inputBox.top) < Math.max(40, inputBox.height);
          const horizontalGap = Math.abs(box.left - inputBox.right);
          const overlapsRightEdge = box.left >= inputBox.left - 8;
          let score = 0;
          if (sameRow) score += 5;
          if (overlapsRightEdge) score += 3;
          score += Math.max(0, 200 - Math.min(horizontalGap, 200)) / 50;
          if (tag === 'select' || role === 'combobox') score += 2;
          if (name.includes('domain') || aria.includes('domain')) score += 3;

          let resolvedSelector: string | null = null;
          if ((node as HTMLElement).id) resolvedSelector = `#${(node as HTMLElement).id}`;
          else if (node.getAttribute('name')) resolvedSelector = `${tag}[name="${node.getAttribute('name')}"]`;
          else if (node.getAttribute('aria-label')) resolvedSelector = `[aria-label*="${node.getAttribute('aria-label')!.slice(0, 20)}"]`;
          else if (role) resolvedSelector = `[role="${role}"]`;
          else resolvedSelector = tag;

          if (resolvedSelector && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { selector: resolvedSelector, score };
          }
        }
      }

      return bestMatch?.selector || null;
    }, inputSelector).catch(() => null);
  }

  private static async fillCompoundEmailField(page: Page, inputSelector: string, emailValue: string) {
    const parts = this.splitEmailParts(emailValue);
    const domainSelector = await this.detectCompoundEmailDomainSelector(page, inputSelector);
    if (!domainSelector) return false;

    await this.clearAndTypeVerified(page, inputSelector, parts.localPart, { numeric: false });

    if (parts.domain) {
      await this.selectFromMixedControl(page, domainSelector, parts.domain);
    }

    const localValue = await page.locator(inputSelector).first().inputValue().catch(() => '');
    if (localValue !== parts.localPart) {
      throw new Error(`Compound email local-part mismatch for ${inputSelector}: expected "${parts.localPart}" got "${localValue}"`);
    }

    logger.info('[COMPOUND-EMAIL] Split email across local-part and domain selector', {
      inputSelector,
      domainSelector,
      localPart: parts.localPart,
      domain: parts.domain || '(unchanged)'
    });
    return true;
  }

  private static isStrictNumericField(selector: string, value: string) {
    const lowSel = (selector || '').toLowerCase();
    return /^\d+$/.test((value || '').trim()) && (
      lowSel.includes('year') ||
      lowSel.includes('ano') ||
      lowSel.includes('año') ||
      lowSel.includes('day') ||
      lowSel.includes('dia') ||
      lowSel.includes('día') ||
      lowSel.includes('birth')
    );
  }

  private static async clearAndTypeVerified(page: Page, selector: string, value: string, options?: { numeric?: boolean }) {
    return BrowserActionService.clearAndTypeVerified(page, selector, value, options);
  }

  private static async selectFromMixedControl(page: Page, selector: string, value: string) {
    return BrowserActionService.selectFromMixedControl(page, selector, value);
  }

  private static async resolveRecovery(page: Page, expected: 'email' | 'password' | 'action'): Promise<{ action: 'retry' | 'skip' | 'use_selector'; selector?: string; healedValue?: string }> {
    let cachedEmail = BrowserNodeService.lastEmail;
    let cachedPassword = BrowserNodeService.lastPassword;
    if (!cachedEmail) {
      try {
        const fs = require('fs');
        if (fs.existsSync('identity_cache.txt')) {
          cachedEmail = fs.readFileSync('identity_cache.txt', 'utf8');
        }
      } catch (e) {}
    }
    if (!cachedPassword) {
      try {
        const fs = require('fs');
        if (fs.existsSync('password_cache.txt')) {
          cachedPassword = fs.readFileSync('password_cache.txt', 'utf8');
        }
      } catch (e) {}
    }
    return BrowserRecoveryService.resolveRecovery(page, expected, cachedEmail, cachedPassword);
  }

  private static inferRequiredStage(selector: string): 'email' | 'password' | 'profile' | 'birth' | null {
    const lowSel = (selector || '').toLowerCase();
    if (/member|loginfmt|i0117|type="email"|input\[type="email"\]|email/.test(lowSel)) return 'email';
    if (/password|passwd|i0118|type="password"/.test(lowSel)) return 'password';
    if (/firstname|lastname|first|last/.test(lowSel)) return 'profile';
    if (/birth|month|day|year|country|mes|dia|día|ano|año|pais|país/.test(lowSel)) return 'birth';
    return null;
  }

  private static isMandatoryField(selector: string) {
    return BrowserPolicyService.isMandatoryField(selector);
  }

  private static async assertStageAlignment(page: Page, selector: string, mode: 'before' | 'after') {
    const requiredStage = BrowserPolicyService.inferRequiredStage(selector);
    if (!requiredStage) return;

    const detectedStage = await this.getMicrosoftStage(page).catch(() => 'unknown');
    if (detectedStage === 'captcha') {
      return;
    }
    let stage = detectedStage;
    if (requiredStage === 'birth' && ['profile', 'unknown'].includes(stage)) {
      stage = await this.reconcileBirthStage(page, stage, mode === 'before' ? 4500 : 2500);
    }

    if (mode === 'before' && requiredStage === 'birth' && detectedStage === 'profile' && stage !== 'birth') {
      const birthSurfaceVisible = await this.hasMicrosoftBirthSurface(page);
      const resolvedFieldVisible = birthSurfaceVisible
        ? await this.hasResolvedFieldSurface(page, selector)
        : false;
      if (birthSurfaceVisible && resolvedFieldVisible) {
        return;
      }
      if (!birthSurfaceVisible) {
        throw new Error(`Flow desynchronized (${mode} step): expected stage ${requiredStage} around selector ${selector}, but current stage is ${stage}`);
      }
    }

    const allowedByStage: Record<string, string[]> = {
      email: ['email', 'password', 'profile', 'birth', 'success'],
      password: ['password', 'profile', 'birth', 'success'],
      profile: ['profile', 'birth', 'success'],
      birth: ['birth', 'profile', 'success']
    };

    const allowed = allowedByStage[requiredStage] || [];
    if (!BrowserPolicyService.isStageCompatible(requiredStage as any, stage) && !allowed.includes(stage)) {
      if (requiredStage === 'birth') {
        const resolvedFieldVisible = await this.hasResolvedFieldSurface(page, selector);
        if (resolvedFieldVisible) {
          return;
        }
      }
      if (mode === 'before' && requiredStage === 'birth' && stage === 'unknown') {
        const birthSurfaceVisible = await this.hasMicrosoftBirthSurface(page);

        if (birthSurfaceVisible) {
          return;
        }
      }
      if (mode === 'before' && requiredStage === 'profile' && stage === 'password') {
        const recovery = await this.resolveRecovery(page, 'password');
        if (recovery.healedValue) {
          BrowserNodeService.lastPassword = recovery.healedValue;
          try {
            require('fs').writeFileSync('password_cache.txt', recovery.healedValue);
          } catch (e) {}
        }
        const recoveredStage = await this.getMicrosoftStage(page).catch(() => 'unknown');
        if (BrowserPolicyService.isStageCompatible(requiredStage as any, recoveredStage) || allowed.includes(recoveredStage)) {
          return;
        }
      }
      throw new Error(`Flow desynchronized (${mode} step): expected stage ${requiredStage} around selector ${selector}, but current stage is ${stage}`);
    }
  }

  private static async assertContractStage(page: Page, expectedStage: string | null | undefined, mode: 'before' | 'after', selector?: string) {
    if (!expectedStage || expectedStage === 'unknown') return;
    const detectedStage = await this.getMicrosoftStage(page).catch(() => 'unknown');
    if (detectedStage === 'captcha') return;
    let stage = detectedStage;
    if (expectedStage === 'birth' && ['profile', 'unknown'].includes(stage)) {
      stage = await this.reconcileBirthStage(page, stage, mode === 'before' ? 4500 : 2500);
    }
    const compatible = BrowserPolicyService.isStageCompatible(expectedStage as any, stage);
    if (!compatible) {
      if (expectedStage === 'birth' && selector) {
        const resolvedFieldVisible = await this.hasResolvedFieldSurface(page, selector);
        if (resolvedFieldVisible) {
          return;
        }
      }
      throw new Error(
        `Flow contract violated (${mode} step): expected stage ${expectedStage}` +
        `${selector ? ` around selector ${selector}` : ''}, but current stage is ${stage}`
      );
    }
  }

  private static async assertFieldValue(page: Page, selector: string, expectedValue: string) {
    const currentValue = await page.locator(selector).first().inputValue().catch(async () => {
      return await page.$eval(selector, (el: any) => (el.value ?? '').toString()).catch(() => '');
    });
    if (currentValue !== expectedValue) {
      throw new Error(`Field value mismatch for ${selector}: expected "${expectedValue}" got "${currentValue}"`);
    }
  }

  private static async canSkipMandatorySelector(page: Page, selector: string, healedValue?: string) {
    if (!BrowserPolicyService.isMandatoryField(selector)) {
      return true;
    }
    if (healedValue === 'ACCOUNT_SUCCESS') {
      return true;
    }

    const requiredStage = BrowserPolicyService.inferRequiredStage(selector);
    if (!requiredStage) {
      return false;
    }

    const stage = await this.getMicrosoftStage(page).catch(() => 'unknown');
    if (requiredStage === 'profile') {
      if (stage === 'success') {
        return true;
      }
      if (stage === 'birth') {
        const birthSurfaceVisible = await this.hasMicrosoftBirthSurface(page);
        const profileSurfaceVisible = await this.hasMicrosoftProfileSurface(page);
        return birthSurfaceVisible && !profileSurfaceVisible;
      }
      return false;
    }
    return BrowserPolicyService.isStageCompatible(requiredStage as any, stage);
  }

  private static isAdvanceButton(selector: string) {
    const lowSel = (selector || '').toLowerCase();
    return /signupbutton|idsibutton9|type="submit"|button|next|siguiente|continue|continuar/.test(lowSel);
  }

  private static async getVisibleValidationMessage(page: Page) {
    return BrowserDiagnosticsService.getVisibleValidationMessage(page);
  }

  private static async assertAdvanceClickProgress(page: Page, selector: string, beforeStage?: string) {
    return BrowserTransitionService.assertAdvanceClickProgress(page, selector, beforeStage);
  }

  // Microsoft / Outlook / Live specific selector waterfall
  private static SELECTOR_WATERFALL: Record<string, string[]> = {
    'email': ['#MemberName', 'input[name="loginfmt"]', '#i0117', 'input[type="email"]', '[placeholder*="Email"]'],
    'password': ['#Password', 'input[name="passwd"]', '#i0118', 'input[type="password"]', '[placeholder*="Password"]'],
    'next': ['#SignupButton', '#idSIButton9', 'button:has-text("Siguiente")', 'button:has-text("Next")', '[type="submit"]'],
    'last_name': ['#LastName', 'input[name="LastName"]', '[placeholder*="Apellido"]'],
    'birth': ['#BirthMonth', '#BirthDay', '#BirthYear', 'select[name="BirthMonth"]', 'input[name="BirthDay"]', 'input[name="BirthYear"]', '[placeholder*="Día"]', '[placeholder*="Año"]', '[aria-label*="Month"]', '[aria-label*="Day"]', '[aria-label*="Year"]', '[aria-label*="Birth"]', 'select[name*="Month"]', 'select[name*="Day"]', 'select[name*="Year"]']
  };

  private static WATERFALL_BOOTSTRAP = (() => {
    BrowserNodeService.SELECTOR_WATERFALL.birth.push(
      '#Country',
      'select[name="BirthDay"]',
      'select[name="Country"]',
      'input[name="Country"]',
      '[placeholder*="Mes"]',
      '[placeholder*="Pais"]',
      '[placeholder*="PaÃ­s"]',
      '[aria-label*="Mes"]',
      '[aria-label*="DÃ­a"]',
      '[aria-label*="AÃ±o"]',
      '[aria-label*="Pais"]',
      '[aria-label*="PaÃ­s"]',
      'select[name*="Country"]',
      '[role="combobox"]'
    );
    BrowserNodeService.SELECTOR_WATERFALL.birth = Array.from(new Set(BrowserNodeService.SELECTOR_WATERFALL.birth));
    return true;
  })();

  /**
   * Universal Selector Waterfall: Supernova Edition (V4.16)
   * Absolute resilience with interactive jiggling and adaptive budget.
   */
  private static async waitForWaterfall(page: Page, type: string, primarySelector: string, timeout: number): Promise<{ selector: string, healedValue?: string }> {
    const lowSel = primarySelector.toLowerCase();
    const expectedField = BrowserPolicyService.inferExpectedField(primarySelector);
    const isDateLike = ['month', 'day', 'year', 'country', 'birth'].includes(expectedField);
    const isCritical = lowSel.includes('pass') || lowSel.includes('member') || lowSel.includes('login') || lowSel.includes('email') || lowSel.includes('name') || lowSel.includes('birth') ||
      lowSel.includes('i0118') || lowSel.includes('i0117') || lowSel.includes('i0116') || lowSel.includes('passwd') ||
      lowSel.includes('signup') || lowSel.includes('next') || lowSel.includes('idSIButton9') || lowSel.includes('first') || lowSel.includes('last') || (type === 'click');

    const effectiveTimeout = isCritical ? Math.max(timeout, 30000) : timeout;

    let healedValue: string | undefined;
    const startTime = Date.now();
    let lastJiggle = Date.now();

    logger.info(`[NEBULA-V4.21] Starting polling for ${primarySelector} (Actual Budget: ${effectiveTimeout}ms)`);

    const uniqueFallbacks = BrowserSelectorService.getFallbackSelectors(primarySelector);

    const nextSelector = BrowserPolicyService.nextButtonSelectors();
    const conflictSelector = '#MemberNameError, [id*="error"], [class*="error"], .suggestion-button, [class*="suggestion"], .suggestionText, button:has-text("taken"), button:has-text("disponible"), button:has-text("ya tiene"), button:has-text("@"), div:has-text("taken")';

    let lastTransitionPush = Date.now();
    const futureFields = ['#BirthMonth', '#BirthYear', 'select[name*="Month"]', '#Country', 'select[name*="Country"]', 'input[name*="Year"]', '[aria-label*="Month"]', '[aria-label*="Year"]', '[aria-label*="Birth"]', '[aria-label*="Mes"]', '[aria-label*="DÃ­a"]', '[aria-label*="AÃ±o"]', '[role="combobox"]', '#BreakTheIce', 'a:has-text("Welcome")', 'button:has-text("Finish")'];
    const victoryFields = ['#BreakTheIce', 'text=Welcome', 'text=Bienvenido', 'text=Finish', 'text=Finalizar', 'h1:has-text("Welcome")', 'h1:has-text("Bienvenido")', '#O365_AppName_Title', '.ms-Icon--OutlookLogo'];

    let panicTriggered = false;
    while (Date.now() - startTime < effectiveTimeout) {
      const elapsed = Date.now() - startTime;
      const stage = await this.getMicrosoftStage(page).catch(() => 'unknown');

      if (stage === 'captcha') {
        const resolved = await this.waitForManualChallengeResolution(page);
        if (resolved) {
          continue;
        }
        throw new Error('Manual human verification required: Microsoft challenge was not resolved before timeout.');
      }

      for (const sel of uniqueFallbacks) {
        if (await page.isVisible(sel).catch(() => false)) {
          logger.info(`[NEBULA-V4.21] Target found: ${sel}`);
          return { selector: sel, healedValue };
        }
      }

      if (isDateLike) {
        if (stage === 'profile') {
          const birthSurfaceVisible = await this.hasMicrosoftBirthSurface(page);
          if (!birthSurfaceVisible) {
            logger.info(`[NEBULA-V4.21] Birth selector ${primarySelector} waiting because the page is still on profile stage.`);
            await page.waitForTimeout(350 + Math.random() * 250);
            continue;
          }
        }
        if (stage === 'success') {
          return { selector: 'SKIPPED', healedValue: 'ACCOUNT_SUCCESS' };
        }

        const semanticSelector = await this.inferSemanticFieldSelector(page, expectedField);
        if (semanticSelector && await page.isVisible(semanticSelector).catch(() => false)) {
          logger.info(`[SEMANTIC-FIELD-RESOLVER] Resolved ${expectedField} to ${semanticSelector}`);
          return { selector: semanticSelector, healedValue };
        }
      }

      const isProfileNameField = lowSel.includes('firstname') || lowSel.includes('lastname');
      if (isProfileNameField) {
        const currentStage = await this.getMicrosoftStage(page).catch(() => 'unknown');
        if (currentStage === 'birth') {
          // MICROSOFT A/B TEST: Sometimes Birth comes before Profile.
          // Instead of skipping Profile, we instruct the Executor to wait or attempt healing.
          // If we skip the Name inputs here, the flow will fail when they appear later.
          // By returning RETRY_HEALED, the recovery system can detect the flow inversion and potentially adapt.
          const birthSurfaceVisible = await this.hasMicrosoftBirthSurface(page);
          const profileSurfaceVisible = await this.hasMicrosoftProfileSurface(page);
          if (birthSurfaceVisible && !profileSurfaceVisible) {
            logger.warn(`[NEBULA-V4.21] Flow inversion detected: Birth stage appeared while looking for ${primarySelector}. Deferring...`);
            return { selector: 'INVERTED_SKIP' };
          }
        }
        if (currentStage === 'success') {
          return { selector: 'SKIPPED', healedValue: 'ACCOUNT_SUCCESS' };
        }
      }

      const currentUrl = page.url().toLowerCase();
      // Victory Radar V4.27: Stronger inbox detection (must contain /mail/ and NOT /signup/)
      const isInboxUrl = (currentUrl.includes('outlook.live.com/mail') || currentUrl.includes('/owa/')) && !currentUrl.includes('signup');

      for (const vic of victoryFields) {
        // Victory Radar V4.26: Inbox check is definitive, but element check needs safety guard for signup pages
        // We also check for 'MemberName' presence to be absolutely sure we aren't at the start
        const isSignupPage = currentUrl.includes('signup') || currentUrl.includes('membername');
        const isDefinitelyInLobby = isInboxUrl || (await page.isVisible(vic).catch(() => false) && !isSignupPage);
        
        if (isDefinitelyInLobby) {
          logger.info(`[VESTA-V4.25] VICTORY DETECTED! Found ${vic} or Inbox URL. Marking step as SKIPPED/SUCCESS.`);
          return { selector: 'SKIPPED', healedValue: 'ACCOUNT_SUCCESS' };
        }
      }

      const isPasswordTarget = lowSel.includes('pass') || lowSel.includes('i0118') || lowSel.includes('passwd');
      const isPasswordUrl = page.url().toLowerCase().includes('signup') && (lowSel.includes('step_6') || lowSel.includes('i0118'));

      if (isPasswordTarget || isPasswordUrl) {
        const captcha = await page.$('#recaptcha, #arkose, iframe[src*="arkoselabs"]').catch(() => null);
        if (captcha) logger.warn(`[GHOST-PROTOCOL] CAPTCHA DETECTED. Proceeding with caution.`);

        for (const sel of uniqueFallbacks) {
          if (await page.isVisible(`${sel}:visible`).catch(() => false)) {
            logger.info(`[GHOST-PROTOCOL] Target Found (${sel}). Locking Ghost Typing.`);
            return { selector: sel, healedValue };
          }
        }

        if (elapsed > 2000) {
          const genericPassword = await page.$('input[type="password"]:visible').catch(() => null);
          if (genericPassword) {
            logger.warn(`[GHOST-PROTOCOL] SINGULARITY STRIKE captured generic password field.`);
            return { selector: 'input[type="password"]:visible', healedValue };
          }
        }

        // Millennium Ghost Reset Detection: Multi-point verification
        const resetSelectors = ['#MemberName', '#i0116', '#loginfmt', 'input[name="loginfmt"]'];
        const isBackAtStart = await page.evaluate((sel) => {
          return sel.some(s => {
            const el = document.querySelector(s) as any;
            return el && el.offsetWidth > 0 && el.offsetHeight > 0;
          });
        }, resetSelectors).catch(() => false);

        const isLookingForEmail = primarySelector.toLowerCase().includes('member') || 
                                 primarySelector.toLowerCase().includes('login') || 
                                 primarySelector.toLowerCase().includes('signup');
        
        if (isBackAtStart && !isLookingForEmail) {
          let cachedEmail = BrowserNodeService.lastEmail;
          if (!cachedEmail) {
            try {
              const fs = require('fs');
              if (fs.existsSync('identity_cache.txt')) {
                cachedEmail = fs.readFileSync('identity_cache.txt', 'utf8');
              }
            } catch (e) {}
          }

          if (await this.restoreEmailStage(page, cachedEmail)) {
            return { selector: 'RETRY_HEALED' };
          }
        }

        if (elapsed > 45000) {
          logger.error(`[SUPERNOVA] CRITICAL TIMEOUT: Forcefully aborting session.`);
          throw new Error('Gale-force timeout hit.');
        }

        if (!this.isStrictRuntime() && elapsed > 20000 && !panicTriggered) {
          logger.warn(`[SUPERNOVA] Extreme stasis detected (20s). Executing Nuclear Reload...`);
          await this.captureDiagnostic(page, `${type}_reload`);
          await page.reload({ waitUntil: 'load', timeout: 30000 }).catch(() => { });
          panicTriggered = true;
          return { selector: 'RETRY_HEALED' };
        }

        if (!this.isStrictRuntime() && elapsed > 10000) {
          await this.jitterMouse(page);
          const res = await (this as any).pageHealer(page);
          if (res?.healedValue) return { selector: 'RETRY_HEALED', healedValue: res.healedValue };
        }

        await page.waitForTimeout(300 + Math.random() * 200);
        continue;
      }

      if (elapsed > 2500) {
        const isAlreadyVisible = await page.isVisible(`${primarySelector}:visible`).catch(() => false);
        if (!isAlreadyVisible && await page.isVisible(`${conflictSelector}:visible`).catch(() => false)) {
          logger.warn(`[VESTA-V4.25] Proactive Conflict Detection! Healing immediately...`);
        if (!this.isStrictRuntime()) {
          const res = await (this as any).pageHealer(page);
          if (res?.healedValue) return { selector: 'RETRY_HEALED', healedValue: res.healedValue };
        }
      }
      }

      const isLoading = await page.evaluate(() => {
        return !!document.querySelector('.win-progress, .ms-Icon--Spinner, [role="progressbar"], .loader, div[class*="loading"]');
      }).catch(() => false);
      if (isLoading) {
        await page.waitForTimeout(1000);
        continue;
      }

      if (BrowserPolicyService.isAdvanceButton(primarySelector) && !this.isStrictRuntime() && !isDateLike && isCritical && (elapsed > 5000) && (Date.now() - lastTransitionPush > 5000)) {
        const anyNext = await page.evaluate(() => {
          const selectors = ['#SignupButton', '#idSIButton9', '[type="submit"]', 'button[aria-label*="Next"]'];
          for (const s of selectors) {
            const el = document.querySelector(s) as HTMLElement;
            if (el && el.offsetParent !== null) return s;
          }
          return null;
        }).catch(() => null);

        if (anyNext) {
          await this.hyperKineticClick(page, anyNext);
          lastTransitionPush = Date.now();
        }
      }

      if (!this.isStrictRuntime() && elapsed > (effectiveTimeout * 0.45) && !panicTriggered) {
        const res = await (this as any).pageHealer(page);
        if (res?.healedValue) healedValue = res.healedValue;
        panicTriggered = true;
      }

      if (!this.isStrictRuntime() && lowSel.includes('pass') && await page.isVisible('#MemberName, input[name="loginfmt"]').catch(() => false)) {
        await page.keyboard.press('Escape').catch(() => { });
        await page.focus('#MemberName, input[name="loginfmt"]').catch(() => { });
        await page.keyboard.press('Enter').catch(() => { });
        await this.hyperKineticClick(page, '#SignupButton, #idSIButton9, button:has-text("Next")');
        await page.waitForTimeout(1000);
      }

      await page.waitForTimeout(400);
    }

    await this.captureDiagnostic(page, type);
    const timeoutDiagnostic = await this.buildTimeoutDiagnostic(page, primarySelector);
    logger.warn('[SELECTOR-TIMEOUT-DIAGNOSTIC]', {
      expectedSelector: primarySelector,
      url: timeoutDiagnostic.url,
      stage: timeoutDiagnostic.stage,
      title: timeoutDiagnostic.title,
      visibleControls: timeoutDiagnostic.controls,
      selectorSuggestions: timeoutDiagnostic.suggestions
    });
    const controlsPreview = timeoutDiagnostic.controls.slice(0, 6).join(' | ');
    const suggestionsPreview = timeoutDiagnostic.suggestions.slice(0, 3).join(' | ');
    throw new Error(
      `Execution Budget Exceeded waiting for: ${primarySelector}. ` +
      `Stage=${timeoutDiagnostic.stage}. URL=${timeoutDiagnostic.url}. ` +
      `VisibleControls=${controlsPreview || 'none'}. ` +
      `SelectorSuggestions=${suggestionsPreview || 'none'}. Gale-force timeout hit.`
    );
  }

  /**
   * Execute a flow step in a browser context
   */
  static async executeBrowserStep(page: Page, step: any): Promise<{ status: 'completed' | 'failed'; output?: any; error?: string }> {
    const { type, config } = step;
    logger.debug('Executing browser step', { type, config });

    try {
      if (this.isLightweightTestPage(page)) {
        return await this.executeLightweightStep(page, step);
      }

      const normalizedType = step?.contract?.normalizedType || type.toLowerCase();
      if (['click', 'type', 'select', 'wait_for_selector', 'waitforselector', 'wait_for_element'].includes(normalizedType)) {
        await this.autoResolveSandboxPressHoldChallenge(page, normalizedType).catch(() => false);
      }
      const retryOptions = this.getRetryOptions(step);
      switch (normalizedType) {
        case 'navigate':
          if (!config?.url) throw new Error('URL is required for navigate step');
          let targetUrl = config.url;
          if (!targetUrl.toString().startsWith('http')) targetUrl = `https://${targetUrl}`;

          if (this.MICROSOFT_SIGNUP_URLS.some(part => targetUrl.includes(part))) {
            await page.context().clearCookies().catch(() => { });
            await page.evaluate(() => {
              try {
                localStorage.clear();
                sessionStorage.clear();
              } catch (e) { }
            }).catch(() => { });
          }

          try {
            await page.goto(targetUrl, { waitUntil: 'load', timeout: 45000 });
            
             if (this.MICROSOFT_SIGNUP_URLS.some(part => targetUrl.includes(part))) {
                logger.info('[QUANTUM-BEHAVIOR] Initiating Pre-Flight Settle (10s)...');
                await this.jitterMouse(page);
                await page.waitForTimeout(5000);

               const hasVisibleFormField = await page.evaluate(() => {
                 const selectors = ['input[type="email"]', 'input[type="text"]', 'input[type="password"]', 'select', 'textarea', '[role="combobox"]'];
                 return selectors.some((sel) => {
                   const el = document.querySelector(sel) as HTMLElement | null;
                   return !!(el && el.offsetParent !== null);
                 });
               }).catch(() => false);

               if (!hasVisibleFormField) {
                 const x = Math.random() * 800 + 100;
                 const y = Math.random() * 600 + 100;
                 logger.info(`[QUANTUM-BEHAVIOR] Delivering Shadow Tap at {${x}, ${y}}`);
                 await page.mouse.click(x, y, { delay: Math.random() * 50 + 50 });
               }
                
                await this.jitterMouse(page);
                await page.waitForTimeout(5000);
             }
            
            await this.pageHealer(page);
            return { status: 'completed', output: { url: page.url() } };
          } catch (e) {
            await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => { });
            return { status: 'completed', output: { url: page.url() } };
          }

        case 'click':
          if (!config?.selector) throw new Error('Selector is required for click step');
          const coordMatch = String(config.selector).match(/^(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)$/);
          if (coordMatch) {
            const targetX = parseFloat(coordMatch[1]);
            const targetY = parseFloat(coordMatch[2]);
            logger.info(`[VISION-CLICK] Natural clicking coordinates {${targetX}, ${targetY}}`);
            const viewport = page.viewportSize() || { width: 1280, height: 720 };
            const startX = Math.random() > 0.5 ? -20 : viewport.width + 20;
            const startY = Math.random() * viewport.height;
            await this.bezierMove(page, startX, startY, targetX, targetY);
            await page.mouse.click(targetX, targetY, { delay: 50 + Math.random() * 100 });
            return { status: 'completed' };
          }
          let clickHealed: any = {};
          await retry(async () => {
            await this.assertContractStage(page, step?.contract?.expectedBeforeStage, 'before', config.selector);
            await this.assertStageAlignment(page, config.selector, 'before');
            const preClickStage = await this.getMicrosoftStage(page).catch(() => 'unknown');
            const { selector, healedValue } = await this.waitForWaterfall(page, 'click', config.selector, this.getStepTimeout(step, 15000));
            if (selector === 'SKIPPED') {
              if (!(await this.canSkipMandatorySelector(page, config.selector, healedValue))) {
                throw new Error(`Mandatory step cannot be skipped safely for selector ${config.selector}`);
              }
              clickHealed.skipped = true;
              if (healedValue) clickHealed.healedValue = healedValue;
              return;
            }
            if (selector === 'INVERTED_SKIP') {
              clickHealed.skipped = true;
              clickHealed.inversionDetected = true;
              return;
            }
            if (selector === 'RETRY_HEALED') {
              if (healedValue) clickHealed.healedValue = healedValue;
              const recovery = await this.resolveRecovery(page, 'action');
              if (recovery.action === 'skip') {
                clickHealed.skipped = true;
                if (recovery.healedValue) clickHealed.healedValue = recovery.healedValue;
                return;
              }
              if (recovery.action === 'use_selector' && recovery.selector) {
                await this.hyperKineticClick(page, recovery.selector);
                return;
              }
              throw new Error('RECOVERY_RETRY');
            }
            if (BrowserPolicyService.isAdvanceButton(selector)) {
              const preClickTrace = await this.capturePreClickTrace(page, selector);
              logger.info('[PRE-CLICK-TRACE]', {
                selector,
                stage: preClickStage,
                activeElement: preClickTrace.activeElement,
                targetText: preClickTrace.targetText,
                visibleInputs: preClickTrace.visibleInputs,
                domainControls: preClickTrace.domainControls
              });
            }
            const skipPrematureBirthAdvance = await this.shouldSkipPrematureBirthAdvance(page, selector, preClickStage, step?.id);
            if (skipPrematureBirthAdvance) {
              logger.info('[ADVANCE-GUARD] Skipping premature advance click because the birth form is already visible but incomplete.', {
                selector,
                stage: preClickStage,
              });
              clickHealed.skipped = true;
              clickHealed.inversionDetected = true;
              if (healedValue) clickHealed.healedValue = healedValue;
              return;
            }
            await this.hydrateIdentityRescue(page).catch(() => {});
            await this.hyperKineticClick(page, selector);
            await this.assertAdvanceClickProgress(page, selector, preClickStage);
            await this.assertStageAlignment(page, config.selector, 'after');
            await this.assertContractStage(page, step?.contract?.expectedAfterStage, 'after', config.selector);
            if (healedValue) clickHealed.healedValue = healedValue;
          }, retryOptions);
          return { status: 'completed', output: clickHealed };

        case 'press_and_hold':
          if (!config?.selector) throw new Error('Selector is required for press_and_hold step');
          if (!config?.durationMs) throw new Error('durationMs is required for press_and_hold step');
          await retry(async () => {
            await this.assertContractStage(page, step?.contract?.expectedBeforeStage, 'before', config.selector);
            await this.assertStageAlignment(page, config.selector, 'before');
            const sandboxChallengeResolved = await this.autoResolveSandboxPressHoldChallenge(page, 'explicit-press-and-hold').catch(() => false);
            if (sandboxChallengeResolved) {
              await this.assertStageAlignment(page, config.selector, 'after');
              await this.assertContractStage(page, step?.contract?.expectedAfterStage, 'after', config.selector);
              return;
            }
            const { selector, healedValue } = await this.waitForWaterfall(page, 'click', config.selector, this.getStepTimeout(step, 15000));
            if (selector === 'SKIPPED') {
              if (!(await this.canSkipMandatorySelector(page, config.selector, healedValue))) {
                throw new Error(`Mandatory step cannot be skipped safely for selector ${config.selector}`);
              }
              return;
            }
            if (selector === 'RETRY_HEALED') {
              throw new Error('RECOVERY_RETRY');
            }
            await this.pressAndHold(page, selector, Number(config.durationMs));
            await this.assertStageAlignment(page, config.selector, 'after');
            await this.assertContractStage(page, step?.contract?.expectedAfterStage, 'after', config.selector);
          }, retryOptions);
          return { status: 'completed', output: { durationMs: Number(config.durationMs) } };

        case 'type':
          if (!config?.selector) throw new Error('Selector is required for type step');
          let typeHealed: any = {};
          await retry(async () => {
            await this.assertContractStage(page, step?.contract?.expectedBeforeStage, 'before', config.selector);
            await this.assertStageAlignment(page, config.selector, 'before');
            if (this.inferRequiredStage(config.selector) === 'profile' && (config.text || '').trim()) {
              this.persistProfileField(config.selector, config.text);
            }
            const { selector, healedValue } = await this.waitForWaterfall(page, 'type', config.selector, this.getStepTimeout(step, 15000));
            if (selector === 'SKIPPED') {
              if (!(await this.canSkipMandatorySelector(page, config.selector, healedValue))) {
                throw new Error(`Mandatory step cannot be skipped safely for selector ${config.selector}`);
              }
              typeHealed.skipped = true;
              if (healedValue) typeHealed.healedValue = healedValue;
              return;
            }
            if (selector === 'INVERTED_SKIP') {
              typeHealed.skipped = true;
              typeHealed.inversionDetected = true;
              return;
            }
            if (selector === 'RETRY_HEALED') {
              if (healedValue) typeHealed.healedValue = healedValue;
              const isPasswordExpected = /pass|passwd|password|i0118/i.test(config.selector || '');
              const isEmailExpected = /member|login|email|i0117/i.test(config.selector || '');
              const recovery = await this.resolveRecovery(page, isPasswordExpected ? 'password' : isEmailExpected ? 'email' : 'action');
              if (recovery.action === 'skip') {
                typeHealed.skipped = true;
                if (recovery.healedValue) typeHealed.healedValue = recovery.healedValue;
                return;
              }
              if (recovery.action === 'use_selector' && recovery.selector) {
                config.selector = recovery.selector;
              } else {
                throw new Error('RECOVERY_RETRY');
              }
            }

            let textToType = typeHealed.healedValue || config.text || '';
            const targetSelector = selector || config.selector;
            this.persistProfileField(config.selector || targetSelector, textToType);
            const descriptor = await BrowserControlService.classify(page, targetSelector);
            logger.info('[CONTROL-CLASSIFICATION]', {
              selector: targetSelector,
              kind: descriptor.kind,
              tagName: descriptor.tagName,
              role: descriptor.role,
              visible: descriptor.visible
            });
            const fieldContext = (descriptor.kind === 'input' || descriptor.kind === 'textarea')
              ? await page.evaluate((resolvedSelector) => {
                  const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
                  const isVisible = (el: Element | null) => {
                    if (!el) return false;
                    const node = el as HTMLElement;
                    const style = window.getComputedStyle(node);
                    return style.visibility !== 'hidden' && style.display !== 'none' && node.offsetWidth > 0 && node.offsetHeight > 0;
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

                  const input = document.querySelector(resolvedSelector) as HTMLElement | null;
                  if (!input || !isVisible(input)) {
                    return null;
                  }

                  const searchable = toSearchable(input);
                  const box = input.getBoundingClientRect();
                  const nearbyControls = Array.from(document.querySelectorAll('select, button, [role="combobox"], [aria-haspopup="listbox"], [tabindex]'))
                    .filter((node) => node !== input && isVisible(node))
                    .map((node) => {
                      const candidateBox = (node as HTMLElement).getBoundingClientRect();
                      const sameRow = Math.abs(candidateBox.top - box.top) < Math.max(48, box.height);
                      const toRight = candidateBox.left >= box.right - 12;
                      const distance = Math.abs(candidateBox.left - box.right);
                      const candidateSearchable = toSearchable(node);
                      let score = 0;
                      if (sameRow) score += 5;
                      if (toRight) score += 5;
                      if (distance < 180) score += Math.max(0, 4 - distance / 45);
                      if (/@hotmail\.com|@outlook\.com|hotmail|outlook|domain|correo/.test(candidateSearchable)) score += 8;
                      return {
                        selector: toSelector(node),
                        searchable: candidateSearchable,
                        score,
                      };
                    })
                    .filter((entry) => entry.selector && entry.score >= 7)
                    .sort((a, b) => b.score - a.score);

                  const bestControl = nearbyControls[0] || null;
                  const controlSearchable = bestControl?.searchable || '';
                  const inferredDomain = controlSearchable.includes('@outlook.com')
                    ? '@outlook.com'
                    : controlSearchable.includes('@hotmail.com') || controlSearchable.includes('hotmail')
                      ? '@hotmail.com'
                      : null;

                  return {
                    looksLikeEmailIdentity: /correo|email|member|loginfmt|nuevo correo|e-?mail/.test(searchable) || (input as HTMLInputElement).type === 'email',
                    hasAdjacentDomainControl: !!bestControl,
                    domainSelector: bestControl?.selector || null,
                    inferredDomain,
                    isMemberName: searchable.includes('membername'),
                  };
                }, targetSelector).catch(() => null)
              : null;
            const lowerTargetSelector = targetSelector.toLowerCase();
            const isSignupMemberField = lowerTargetSelector.includes('membername') || !!fieldContext?.isMemberName;
            const isEmailField = !!fieldContext?.looksLikeEmailIdentity || lowerTargetSelector.includes('email') || lowerTargetSelector.includes('member') || lowerTargetSelector.includes('loginfmt') || lowerTargetSelector.includes('i0117');
            const currentStage = isEmailField ? await this.getMicrosoftStage(page).catch(() => 'unknown') : 'unknown';
            const compoundDomainSelector = isEmailField
              ? fieldContext?.domainSelector || await this.detectCompoundEmailDomainSelector(page, targetSelector)
              : null;
            
            // Proactive Wait: Lazy-loaded Microsoft domain dropdowns
            let hasVisibleSignupDomainControl = isEmailField ? !!fieldContext?.hasAdjacentDomainControl || !!compoundDomainSelector : false;
            if (isEmailField && !hasVisibleSignupDomainControl && currentStage === 'email') {
              await page.waitForTimeout(1500);
              const recheck = await page.evaluate((sel) => {
                const input = document.querySelector(sel) as HTMLElement | null;
                if (!input) return null;
                const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
                const isVisible = (el: Element | null) => {
                  if (!el) return false;
                  const node = el as HTMLElement;
                  const style = window.getComputedStyle(node);
                  return style.visibility !== 'hidden' && style.display !== 'none' && node.offsetWidth > 0 && node.offsetHeight > 0;
                };
                const toSearchable = (node: Element | null) => {
                  if (!node) return '';
                  return [normalize(node.textContent), normalize(node.getAttribute('name')), normalize(node.getAttribute('aria-label'))].join(' ').toLowerCase();
                };
                const box = input.getBoundingClientRect();
                const nearby = Array.from(document.querySelectorAll('select, button, [role="combobox"]'))
                  .filter((node) => node !== input && isVisible(node))
                  .some((node) => {
                    const cBox = (node as HTMLElement).getBoundingClientRect();
                    const sameRow = Math.abs(cBox.top - box.top) < Math.max(48, box.height);
                    const search = toSearchable(node);
                    return sameRow && (/@hotmail\.com|@outlook\.com|hotmail|outlook|domain|correo/.test(search));
                  });
                return { hasAdjacentDomainControl: nearby };
              }, targetSelector).catch(() => null);
              
              if (recheck?.hasAdjacentDomainControl) {
                hasVisibleSignupDomainControl = true;
                logger.info('[ADAPTIVE-IDENTITY] Microsoft signup domain control lazy-detected after wait.');
              }
            }
            const isMicrosoftSignupIdentityField = isEmailField && (
              currentStage === 'email' ||
              hasVisibleSignupDomainControl ||
              !!compoundDomainSelector ||
              isSignupMemberField
            );
            let expectedDomainForSignup: string | null = null;

            if (isMicrosoftSignupIdentityField && typeof textToType === 'string' && textToType.trim()) {
              const trimmedIdentity = textToType.trim();
              const hasExplicitDomain = this.isEmailLike(trimmedIdentity) || trimmedIdentity.includes('@');
              const { localPart, domain } = this.splitEmailParts(trimmedIdentity);

              if (hasVisibleSignupDomainControl) {
                expectedDomainForSignup = domain || fieldContext?.inferredDomain || '@hotmail.com';
                textToType = localPart || trimmedIdentity;
                logger.info('[ADAPTIVE-IDENTITY] Microsoft signup domain control detected; keeping local-part in input', {
                  selector: targetSelector,
                  domainSelector: compoundDomainSelector,
                  stage: currentStage,
                  identity: textToType,
                  expectedDomain: expectedDomainForSignup,
                });
              } else if (!hasExplicitDomain) {
                textToType = `${localPart || trimmedIdentity}@hotmail.com`;
                logger.info('[ADAPTIVE-IDENTITY] No domain dropdown detected; promoting signup username to full email', {
                  selector: targetSelector,
                  stage: currentStage,
                  identity: textToType,
                });
              }
            } else if (isEmailField && textToType && !this.isEmailLike(textToType)) {
              if (textToType.includes(' ') || textToType.includes('@')) {
                throw new Error(`Invalid email input for selector ${targetSelector}: expected someone@example.com, got "${textToType}"`);
              }
              const healedEmail = `${textToType}@hotmail.com`;
              logger.warn(`[ADAPTIVE-IDENTITY] Converting username-only input "${textToType}" to "${healedEmail}" for field ${targetSelector}`);
              textToType = healedEmail;
            }

            if (targetSelector.includes('MemberName') || targetSelector.includes('loginfmt') || targetSelector.includes('i0117') || !!fieldContext?.looksLikeEmailIdentity) {
              const cachedIdentity = expectedDomainForSignup && typeof textToType === 'string' && !this.isEmailLike(textToType)
                ? `${textToType}${expectedDomainForSignup}`
                : textToType;
              BrowserNodeService.lastEmail = cachedIdentity;
              try {
                require('fs').writeFileSync('identity_cache.txt', cachedIdentity);
              } catch (e) {}
              logger.info(`[RECURSIVE-REALITY] Identity cached: ${cachedIdentity}`);
            }

            const element = await page.$(targetSelector);
            if (element) {
              let text = textToType;
              const isPassword = descriptor.kind === 'password' || targetSelector.toLowerCase().includes('pass') || (await element.getAttribute('type')) === 'password';

              if (step?.contract?.controlKind === 'button') {
                throw new Error(`Flow contract rejected typing into button-like selector ${targetSelector}`);
              }

              if (isPassword) {
                BrowserNodeService.lastPassword = text;
                try {
                  require('fs').writeFileSync('password_cache.txt', text);
                } catch (e) {}
                await page.waitForTimeout(1500 + Math.random() * 1000);
                for (let pulse = 0; pulse < 3; pulse++) {
                  await this.jitterMouse(page);
                  await page.evaluate(({ sel, val }) => {
                    const el = document.querySelector(sel) as any;
                    if (el) {
                      el.value = val;
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                  }, { sel: targetSelector, val: text }).catch(() => { });
                  await page.fill(targetSelector, text, { force: true }).catch(() => { });
                  const typedVal = await page.$eval(targetSelector, (el: any) => el.value).catch(() => '');
                  if (typedVal === text) break;
                  await page.waitForTimeout(500 + Math.random() * 500);
                }

                await page.waitForTimeout(1000 + Math.random() * 1000); // Human quiescent wait
                const hyperNext = BrowserPolicyService.nextButtonSelectors();
                for (let i = 0; i < 15; i++) {
                  if (i > 0) {
                    await page.keyboard.press('Escape').catch(() => { });
                    if (i % 3 === 0) {
                      await this.jitterMouse(page);
                      await page.keyboard.press('Tab').catch(() => { });
                    }
                    await page.keyboard.press('Enter').catch(() => { });
                  }
                  await this.hyperKineticClick(page, hyperNext);
                  await page.waitForTimeout(2500 + Math.random() * 1500);
                  const isSuccess = await page.evaluate(() => !!document.querySelector('input[name*="Birth"], #FirstName, iframe[src*="arkose"]')).catch(() => false);
                  if (isSuccess) break;
                }
              } else {
                const isStrictNumeric = this.isStrictNumericField(targetSelector, text);
                if (descriptor.kind === 'select' || descriptor.kind === 'combobox') {
                  await this.selectFromMixedControl(page, targetSelector, text);
                } else if (isStrictNumeric) {
                  await this.clearAndTypeVerified(page, targetSelector, text, { numeric: true });
                } else {
                  await page.focus(targetSelector);
                  await page.waitForTimeout(Math.random() * 500 + 500);
                  await page.click(targetSelector, { clickCount: 3 }).catch(() => {});
                  await page.keyboard.press('Control+A').catch(() => {});
                  await page.keyboard.press('Backspace').catch(() => {});
      for (const char of text) {
                    await page.keyboard.type(char, { delay: await HumanBehaviorPolicyService.nextKeypressDelay() });
                  }
                  const typedVal = await page.$eval(targetSelector, (el: any) => (el.value ?? '').toString()).catch(() => '');
                  if (typedVal !== text) {
                    await this.clearAndTypeVerified(page, targetSelector, text, { numeric: false });
                  }
                }
                const isEmail = isEmailField;
                if (isEmail) {
                  const compoundIdentity = expectedDomainForSignup ? `${text}${expectedDomainForSignup}` : text;
                  const usedCompoundField = compoundDomainSelector
                    ? await this.fillCompoundEmailField(page, targetSelector, compoundIdentity).catch(() => false)
                    : false;
                  if (!usedCompoundField) {
                    await this.assertFieldValue(page, targetSelector, text);
                  }
                  logger.info('[BEHAVIORAL-PULSE] Email detected. Initiating Quiescent Settle (5s)...');
                  await this.jitterMouse(page);
                  await page.waitForTimeout(await HumanBehaviorPolicyService.nextSettleDelay());
                  await this.jitterMouse(page);
                } else {
                  await page.waitForTimeout(await HumanBehaviorPolicyService.nextSettleDelay());
                }
              }
            }
            this.persistBirthField(targetSelector, textToType);
            if (healedValue) typeHealed.healedValue = healedValue;
            await this.assertStageAlignment(page, config.selector, 'after');
            await this.assertContractStage(page, step?.contract?.expectedAfterStage, 'after', config.selector);
          }, retryOptions);
          return { status: 'completed', output: typeHealed };

        case 'wait':
          await page.waitForTimeout(config?.duration || 1000);
          return { status: 'completed' };

        case 'select':
        case 'select_option':
          if (!config?.selector || config?.value === undefined) throw new Error('Selector and value are required');
          await retry(async () => {
            await this.assertContractStage(page, step?.contract?.expectedBeforeStage, 'before', config.selector);
            const { selector } = await this.waitForWaterfall(page, 'select', config.selector, this.getStepTimeout(step, 15000));
            if (selector === 'SKIPPED') return;
            if (selector === 'RETRY_HEALED') {
              const recovery = await this.resolveRecovery(page, 'action');
              if (recovery.action === 'skip') return;
              throw new Error('RECOVERY_RETRY');
            }

            const descriptor = await BrowserControlService.classify(page, selector);
            if (step?.contract?.controlKind === 'button') {
              throw new Error(`Flow contract rejected select on button-like selector ${selector}`);
            }
            logger.info('[CONTROL-CLASSIFICATION]', {
              selector,
              kind: descriptor.kind,
              tagName: descriptor.tagName,
              role: descriptor.role,
              visible: descriptor.visible
            });
            await this.selectFromMixedControl(page, selector, config.value.toString());
            this.persistBirthField(selector, config.value.toString());
            await this.assertContractStage(page, step?.contract?.expectedAfterStage, 'after', config.selector);
          }, retryOptions);
          return { status: 'completed' };

        case 'wait_for_selector':
        case 'waitforselector':
        case 'wait_for_element':
          if (!config?.selector) throw new Error('Selector required');
          let waitHealed: any = {};
          await retry(async () => {
            await this.assertContractStage(page, step?.contract?.expectedBeforeStage, 'before', config.selector);
            await this.assertStageAlignment(page, config.selector, 'before');
            await this.pageHealer(page);
            const { selector, healedValue } = await this.waitForWaterfall(page, 'wait', config.selector, this.getStepTimeout(step, 15000));
            if (selector === 'SKIPPED') {
              if (!(await this.canSkipMandatorySelector(page, config.selector, healedValue))) {
                throw new Error(`Mandatory wait cannot be skipped safely for selector ${config.selector}`);
              }
              waitHealed.skipped = true;
              if (healedValue) waitHealed.healedValue = healedValue;
              return;
            }
            if (selector === 'INVERTED_SKIP') {
              waitHealed.skipped = true;
              waitHealed.inversionDetected = true;
              return;
            }
            if (selector === 'RETRY_HEALED') {
              const isPasswordExpected = /pass|passwd|password|i0118/i.test(config.selector || '');
              const isEmailExpected = /member|login|email|i0117/i.test(config.selector || '');
              const recovery = await this.resolveRecovery(page, isPasswordExpected ? 'password' : isEmailExpected ? 'email' : 'action');
              if (recovery.action === 'skip') return;
              if (recovery.action === 'use_selector' && recovery.selector) return;
              if (healedValue === 'ACCOUNT_SUCCESS') return;
              throw new Error('RECOVERY_RETRY');
            }
            await this.assertStageAlignment(page, config.selector, 'after');
            await this.assertContractStage(page, step?.contract?.expectedAfterStage, 'after', config.selector);
          }, retryOptions);
          return { status: 'completed', output: waitHealed };

        case 'screenshot':
          const buffer = await page.screenshot({ fullPage: true });
          return { status: 'completed', output: { screenshot: `data:image/png;base64,${buffer.toString('base64')}` } };

        default:
          throw new Error(`Unsupported type: ${type}`);
      }
    } catch (error: any) {
      return { status: 'failed', error: error.message };
    }
  }

  /**
   * Nuclear Healer: Quantum Oracle V4.67
   */
  private static async pageHealer(page: Page): Promise<{ healedValue?: string } | undefined> {
    const url = page.url().toLowerCase();
    let healedValue: string | undefined;

    const isTyping = await page.evaluate(() => {
      const active = document.activeElement;
      return active && (active.tagName === 'INPUT' || (active as HTMLElement).isContentEditable);
    }).catch(() => false);

    if (isTyping && !(url.includes('membername') || url.includes('live.com') || url.includes('microsoft.com') || url.includes('outlook'))) return;

    if (url.includes('live.com') || url.includes('microsoft.com') || url.includes('outlook')) {
      const profileHealed = await this.hydrateIdentityRescue(page).catch(() => false);
      if (profileHealed) {
        logger.info('[QUANTUM-ORACLE] Profile fields hydrated from cached identity.');
        await page.waitForTimeout(400 + Math.random() * 300);
      }

      const oracleData = await page.evaluate(() => {
        const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
        const isVisible = (el: Element | null) => {
          if (!el) return false;
          const node = el as HTMLElement;
          const style = window.getComputedStyle(node);
          return style.visibility !== 'hidden' && style.display !== 'none' && node.offsetWidth > 0 && node.offsetHeight > 0;
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

        const emailInput = Array.from(document.querySelectorAll('input'))
          .filter((node) => isVisible(node))
          .map((node) => {
            const searchable = toSearchable(node);
            let score = 0;
            if (node === document.activeElement) score += 8;
            if ((node as HTMLInputElement).type.toLowerCase() === 'email') score += 6;
            if (/correo|email|member|loginfmt|nuevo correo|e-?mail/.test(searchable)) score += 6;
            return {
              node,
              score,
            };
          })
          .sort((a, b) => b.score - a.score)[0]?.node as HTMLInputElement | undefined;

        const hasDomainControl = emailInput
          ? Array.from(document.querySelectorAll('select, button, [role="combobox"], [aria-haspopup="listbox"], [tabindex]'))
              .filter((node) => node !== emailInput && isVisible(node))
              .some((node) => {
                const searchable = toSearchable(node);
                const box = (node as HTMLElement).getBoundingClientRect();
                const inputBox = emailInput.getBoundingClientRect();
                const sameRow = Math.abs(box.top - inputBox.top) < Math.max(48, inputBox.height);
                const toRight = box.left >= inputBox.right - 12;
                return sameRow && toRight && (/@hotmail\.com|@outlook\.com|hotmail|outlook|domain|correo/.test(searchable) || box.left - inputBox.right < 180);
              })
          : false;

        const isNext = !!document.querySelector('#SignupButton, #idSIButton9');
        const emailValue = emailInput?.value?.trim() || '';
        return {
          isEmail: !!emailInput,
          isNext,
          emailValue,
          emailSelector: toSelector(emailInput) || '#MemberName',
          hasDomainControl,
        };
      }).catch(() => ({ isEmail: false, isNext: false, emailValue: '', emailSelector: '#MemberName', hasDomainControl: false }));

      if (!this.isStrictRuntime() && oracleData.isEmail && oracleData.isNext && oracleData.emailValue) {
        await this.hyperKineticClick(page, '#SignupButton, #idSIButton9');
      }

      const barriers = [
        { name: 'Cookie', selector: 'button#cookie-accept, #accept-button, button:has-text("Aceptar")' },
        { name: 'Privacy', selector: 'button:has-text("Aceptar"), #acceptButton, #idSIButton9' },
        { name: 'Session', selector: 'button:has-text("Continuar"), #idSIButton9' },
        { name: 'Passkey', selector: 'button:has-text("Cancelar"), #idSIButton9' },
        { name: 'StayIn', selector: 'button:has-text("Sí"), button:has-text("Yes"), #idSIButton9' },
        { name: 'Conflict', selector: '#MemberNameError, .suggestion-button, .fui-InteractionTagPrimary, [class*="suggestion"], button[id^="Selection"], div:has-text("ya está en uso"), div:has-text("already in use")' }
      ];

      for (const barrier of barriers) {
        try {
          const el = await page.$(barrier.selector);
          if (el && await el.isVisible()) {
            if (barrier.name === 'Conflict') {
              if (!this.shouldAllowAutoHealingMutations()) {
                logger.warn('[QUANTUM-ORACLE] Conflict detected in strict mode; surfacing diagnostic without mutating the form.');
                return healedValue ? { healedValue } : undefined;
              }
              logger.warn(`[QUANTUM-ORACLE] Conflict Detected via ${barrier.selector}. Healing...`);
              await this.jitterMouse(page);
              
              const oracleSuggestions = await page.evaluate((emailSelector) => {
                const results: { text: string; id: string }[] = [];
                const currentVal = (document.querySelector(emailSelector) as HTMLInputElement | null)?.value?.trim() || '';
                const all = Array.from(document.querySelectorAll('button, div[role="button"], span[class*="suggestion"], .fui-InteractionTagPrimary, [role="option"]'));
                for (const item of all) {
                  const txt = (item as HTMLElement).innerText?.trim() || (item as HTMLElement).textContent?.trim() || '';
                  if (txt.length > 2 && txt.length < 50 && !txt.includes('\n') && txt !== currentVal) {
                    const id = item.id || `gen-${Math.random().toString(36).substring(7)}`;
                    if (!item.id) item.id = id;
                    results.push({ text: txt, id });
                  }
                }
                return results;
              }, oracleData.emailSelector);

              if (oracleSuggestions.length > 0) {
                const best = oracleSuggestions[0];
                logger.info(`[QUANTUM-ORACLE] Selecting bubble suggestion: ${best.text} (ID: ${best.id})`);
                
                // Human-mimetic hover (V27 Discrete Strike)
                await page.hover(`#${best.id}`, { timeout: 2000 }).catch(() => {});
                await page.waitForTimeout(4000 + Math.random() * 3000); // Gaze Period

                await this.hyperKineticClick(page, `#${best.id}`).catch(async () => {
                   logger.warn(`[QUANTUM-ORACLE] First click failed for ${best.text}. Escaping to nuclear evaluate click.`);
                   await page.evaluate((id) => {
                     const btn = document.getElementById(id);
                     if (btn) btn.click();
                   }, best.id);
                });
                
                healedValue = best.text;
                await this.jitterMouse(page);
                
                // Verify transition and force sync if needed
                const input = await page.$(oracleData.emailSelector);
                if (input) {
                   const newVal = await input.inputValue();
                   if (!newVal.includes(best.text)) {
                      logger.warn(`[QUANTUM-ORACLE] Sync Stasis detected. Forcing manual fill for ${best.text}`);
                      await input.fill(best.text);
                   }
                }

                // Human-mimetic scrolling noise
                await page.mouse.wheel(0, 100).catch(() => {});
                await page.waitForTimeout(500);
                await page.mouse.wheel(0, -100).catch(() => {});
                
                await page.waitForTimeout(4000 + Math.random() * 2000); 
                await this.hyperKineticClick(page, '#SignupButton, #idSIButton9');
                return { healedValue };
              } else {
                const input = await page.$(oracleData.emailSelector);
                if (input) {
                  const hasDropdown = oracleData.hasDomainControl;
                  const prefix = (await input.inputValue().catch(() => '')).split('@')[0] || 'user';
                  const suffix = hasDropdown ? '' : '@hotmail.com';
                  const mutatedName = `${prefix}${Math.floor(Math.random() * 999999)}${suffix}`;
                  
                  logger.info(`[QUANTUM-ORACLE] No suggestions found. Performing Hyper-Mutation (Schema: ${hasDropdown ? 'Prefix' : 'Full'}): ${mutatedName}`);
                  await input.click({ clickCount: 3 });
                  await input.fill(mutatedName);
                  healedValue = mutatedName;
                  await this.jitterMouse(page);
                  await page.waitForTimeout(1000);
                  await page.keyboard.press('Enter');
                }
              }
              await this.jitterMouse(page);
              await page.waitForTimeout(3000 + Math.random() * 2000); // Extended Behavioral Cooling
              await this.hyperKineticClick(page, '#SignupButton, #idSIButton9');
              return { healedValue };
            } else {
              await el.click({ timeout: 3000 }).catch(() => { });
            }
          }
        } catch (e) { }
      }
    }
    return healedValue ? { healedValue } : undefined;
  }

  /**
   * Hyper-Kinetic Click (Universal Hijack)
   */
  private static async hyperKineticClick(page: Page, selector: string) {
    if (this.isStrictRuntime()) {
      const nativeStrict = await page.locator(selector).first().click({ timeout: 3000 }).then(() => true).catch(() => false);
      if (nativeStrict) return true;
    }

    await this.humanMouseMove(page, selector).catch(() => {});

    const box = await page.locator(selector).boundingBox().catch(() => null);
    if (box) {
      const x = box.x + box.width / 2 + (Math.random() * 10 - 5);
      const y = box.y + box.height / 2 + (Math.random() * 10 - 5);
      await page.mouse.move(x, y, { steps: 5 });
      await page.mouse.click(x, y, { delay: Math.random() * 100 + 50 });
      return true;
    }

    const native = await page.click(selector, { timeout: 2000, force: true }).then(() => true).catch(() => false);
    if (native) return true;

    if (this.isStrictRuntime() && !this.shouldAllowAggressiveClicks()) {
      return false;
    }

    await this.atomicPurge(page);
    await page.evaluate((s) => {
      const el = document.querySelector(s) as HTMLElement;
      if (el) {
        el.click();
        const form = el.closest('form');
        if (form) form.submit();
      }
    }, selector).catch(() => { });

    await page.keyboard.press('Enter').catch(() => { });
    return true;
  }

  private static async pressAndHold(page: Page, selector: string, durationMs: number) {
    const holdMs = Math.max(100, Number(durationMs) || 0);
    const locator = page.locator(selector).first();

    if (this.isStrictRuntime()) {
      const strictHeld = await locator.evaluate(async (element, ms) => {
        const target = element as HTMLElement;
        const rect = target.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const pointerInit = {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          buttons: 1,
        };
        target.dispatchEvent(new PointerEvent('pointerdown', pointerInit));
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: 1 }));
        await new Promise((resolve) => window.setTimeout(resolve, ms));
        target.dispatchEvent(new PointerEvent('pointerup', { ...pointerInit, buttons: 0 }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: 0 }));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        return true;
      }, holdMs).catch(() => false);
      if (strictHeld) return true;
    }

    await this.humanMouseMove(page, selector).catch(() => {});
    const box = await locator.boundingBox().catch(() => null);
    if (!box) {
      const fallback = await page.evaluate(async ({ targetSelector, holdMs: ms }) => {
        const target = document.querySelector(targetSelector) as HTMLElement | null;
        if (!target) return false;
        const rect = target.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const pointerInit = {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          buttons: 1,
        };
        target.dispatchEvent(new PointerEvent('pointerdown', pointerInit));
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: 1 }));
        await new Promise((resolve) => window.setTimeout(resolve, ms));
        target.dispatchEvent(new PointerEvent('pointerup', { ...pointerInit, buttons: 0 }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: 0 }));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        return true;
      }, { targetSelector: selector, holdMs }).catch(() => false);
      if (!fallback) {
        throw new Error(`Could not press and hold selector ${selector}`);
      }
      return true;
    }

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y, { steps: 6 });
    await page.mouse.down();
    await page.waitForTimeout(holdMs);
    await page.mouse.up();
    return true;
  }

  private static async detectSandboxPressHoldChallenge(page: Page): Promise<{ selector: string; durationMs: number } | null> {
    return await page.evaluate(() => {
      const isVisible = (el: Element | null) => {
        if (!el) return false;
        const node = el as HTMLElement;
        const style = window.getComputedStyle(node);
        return style.visibility !== 'hidden' && style.display !== 'none' && node.offsetWidth > 0 && node.offsetHeight > 0;
      };

      const shell = document.querySelector('[data-camel-kind="mock-challenge"]');
      const button = document.querySelector('[data-camel-role="press-hold"]') as HTMLElement | null;
      if (!shell || !button || !isVisible(button)) return null;

      const state = String(button.getAttribute('data-camel-state') || '').trim().toLowerCase();
      if (state === 'resolved' || button.hasAttribute('disabled')) return null;

      const attrDuration = Number(button.getAttribute('data-camel-hold-ms') || button.getAttribute('data-hold-ms') || 0);
      const visibleTextDuration = Number(String(document.querySelector('[data-camel-role="hold-ms"]')?.textContent || '').replace(/[^\d]/g, ''));
      const durationMs = Math.max(100, attrDuration || visibleTextDuration || 2200);

      return {
        selector: '[data-camel-role="press-hold"]',
        durationMs,
      };
    }).catch(() => null);
  }

  private static async isSandboxPressHoldResolved(page: Page) {
    return await page.evaluate(() => {
      const resolvedMarker = document.querySelector('[data-camel-state="resolved"]');
      if (resolvedMarker) return true;

      const shell = document.querySelector('[data-camel-kind="mock-challenge"]');
      const button = document.querySelector('[data-camel-role="press-hold"]') as HTMLElement | null;
      if (!shell) return true;
      if (!button) return false;

      const state = String(button.getAttribute('data-camel-state') || '').trim().toLowerCase();
      return state === 'resolved' || button.hasAttribute('disabled');
    }).catch(() => false);
  }

  private static async waitForSandboxPressHoldManualResolution(
    page: Page,
    challenge: { selector: string; durationMs: number },
    reason: string,
    timeoutMs = 180000
  ) {
    logger.warn('[SANDBOX-PRESS-HOLD] Waiting for manual intervention on trusted Camel challenge', {
      reason,
      selector: challenge.selector,
      durationMs: challenge.durationMs,
      timeoutMs,
    });

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await page.waitForTimeout(1500).catch(() => {});
      if (await this.isSandboxPressHoldResolved(page)) {
        logger.info('[SANDBOX-PRESS-HOLD] Manual intervention completed. Resuming flow.', {
          reason,
          selector: challenge.selector,
        });
        return true;
      }
    }

    throw new Error('Manual sandbox challenge intervention required before flow can continue.');
  }

  private static async autoResolveSandboxPressHoldChallenge(page: Page, reason: string) {
    const challenge = await this.detectSandboxPressHoldChallenge(page);
    if (!challenge) return false;

    logger.info('[SANDBOX-PRESS-HOLD] Attempting auto-resolution for trusted Camel mock challenge', {
      reason,
      selector: challenge.selector,
      durationMs: challenge.durationMs,
    });

    try {
      await this.pressAndHold(page, challenge.selector, challenge.durationMs);
      const autoResolved = await page.waitForSelector('[data-camel-state="resolved"]', {
        timeout: Math.max(5000, challenge.durationMs + 4000),
        state: 'visible',
      }).then(() => true).catch(async () => this.isSandboxPressHoldResolved(page));

      if (autoResolved) {
        logger.info('[SANDBOX-PRESS-HOLD] Challenge auto-resolved successfully', {
          reason,
          selector: challenge.selector,
        });
        return true;
      }
    } catch (error: any) {
      logger.warn('[SANDBOX-PRESS-HOLD] Auto-resolution failed; switching to manual fallback', {
        reason,
        selector: challenge.selector,
        error: error?.message,
      });
    }

    return await this.waitForSandboxPressHoldManualResolution(page, challenge, reason);
  }

  /**
   * Atomic Purge (Non-Destructive)
   */
  private static async atomicPurge(page: Page) {
    await page.evaluate(() => {
      document.querySelectorAll('[data-portal-node="true"], .ms-Layer').forEach(el => {
        (el as HTMLElement).style.visibility = 'hidden';
        (el as HTMLElement).style.pointerEvents = 'none';
      });
      document.body.style.pointerEvents = 'auto';
    }).catch(() => { });
  }

  /**
   * Run a new session with persistent context
   */
  static async createPage(profileId: string = 'default', fingerprint?: any, proxy?: any, storageState?: any) {
    this.clearIdleContextTimer(profileId);
    const context = await this.getContext(profileId, fingerprint, proxy, storageState);
    const page = await context.newPage();
    page.on('close', () => {
      this.scheduleIdleContextClose(profileId, 'last-page-closed');
    });
    const tenantId = this.activeProfileTenants.get(profileId) || null;
    await RuntimeMitigationService.attach(page, context, {
      tenantId,
      profileId,
      fingerprint,
      proxy,
    });
    
    // Cortex Mirror: Bridge browser console to system logger
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[QUANTUM') || msg.type() === 'error') {
         logger.info(`[BROWSER-CONSOLE] [${msg.type()}] ${text}`);
      }
    });

    return page;
  }

  /**
   * Proactive memory optimization for the browser layer.
   */
  static optimizeMemory() {
    logger.info('[BROWSER-OPTIMIZE] Running deep memory reclamation...');
    
    // 1. Close idle contexts that might have been missed by timers
    const now = Date.now();
    for (const [profileId, context] of this.activeContexts.entries()) {
      const pages = context.pages();
      if (pages.length === 0) {
        logger.info(`[BROWSER-OPTIMIZE] Closing orphaned idle context for ${profileId}`);
        context.close().catch(() => {});
      }
    }

    // 2. Clear volatile singleton caches
    this.lastEmail = null;
    this.lastPassword = null;
    
    // 3. Re-initialize vision and captcha services if they have leaked
    // (This is a placeholder for future service-level cache clearing)
  }

  /**
   * Graceful shutdown of all browser resources.
   */
  static async dispose() {
    logger.info('[BROWSER-DISPOSE] Shutting down all browser resources...');
    
    const contextClosures = Array.from(this.activeContexts.values()).map(ctx => ctx.close().catch(() => {}));
    await Promise.all(contextClosures);
    this.activeContexts.clear();
    
    for (const interval of this.runtimeLeaseIntervals.values()) {
      clearInterval(interval);
    }
    this.runtimeLeaseIntervals.clear();

    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

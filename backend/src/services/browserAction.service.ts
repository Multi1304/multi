import { Page } from 'playwright';
import { logger } from '../utils/logger';

export class BrowserActionService {
  private static normalizeText(value: string | null | undefined) {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private static buildSelectionVariants(value: string) {
    const raw = String(value || '').trim();
    const variants = new Set<string>();
    if (!raw) return [];

    variants.add(raw);

    if (/^\d+$/.test(raw)) {
      const numeric = String(parseInt(raw, 10));
      variants.add(numeric);
      variants.add(numeric.padStart(2, '0'));

      const monthIdx = parseInt(raw, 10) - 1;
      const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthsEs = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      if (monthIdx >= 0 && monthIdx < 12) {
        variants.add(monthsEn[monthIdx]);
        variants.add(monthsEs[monthIdx]);
      }
    }

    return Array.from(variants);
  }

  private static async didControlReflectValue(page: Page, selector: string, value: string) {
    const expectedVariants = this.buildSelectionVariants(value).map((entry) => this.normalizeText(entry));
    return await page.evaluate(({ resolvedSelector, variants }) => {
      const normalize = (input: string | null | undefined) => (input || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const element = document.querySelector(resolvedSelector) as HTMLElement | null;
      if (!element) return false;

      const texts = new Set<string>();
      const pushText = (candidate: string | null | undefined) => {
        const normalized = normalize(candidate);
        if (normalized) texts.add(normalized);
      };

      pushText(element.textContent);
      pushText(element.getAttribute('aria-label'));
      pushText(element.getAttribute('data-value'));
      pushText((element as HTMLInputElement).value);

      if (element instanceof HTMLSelectElement) {
        const selected = element.selectedOptions?.[0];
        pushText(selected?.label);
        pushText(selected?.textContent);
        pushText(selected?.value);
      }

      for (const variant of variants) {
        if (Array.from(texts).some((text) => text === variant || text.includes(variant))) {
          return true;
        }
      }

      return false;
    }, { resolvedSelector: selector, variants: expectedVariants }).catch(() => false);
  }

  private static async forceSetInputValue(page: Page, selector: string, value: string) {
    return await page.evaluate(({ resolvedSelector, desired }) => {
      const element = document.querySelector(resolvedSelector) as HTMLInputElement | null;
      if (!element) return '';
      element.focus();
      element.value = desired;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.blur();
      return element.value || '';
    }, { resolvedSelector: selector, desired: value }).catch(() => '');
  }

  private static async clickVisibleOptionViaDom(page: Page, variants: string[]) {
    return await page.evaluate(({ labels }) => {
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

      const targets = Array.from(document.querySelectorAll('[role="option"], [role="listbox"] *, li, button, div, span'))
        .filter((node) => isVisible(node))
        .map((node) => ({
          node,
          text: normalize(node.textContent),
          role: normalize(node.getAttribute('role')),
        }))
        .filter((entry) => entry.text);

      for (const label of labels) {
        const normalized = normalize(label);
        const exact = targets.find((entry) => entry.text === normalized);
        if (exact) {
          (exact.node as HTMLElement).click();
          return true;
        }
      }

      for (const label of labels) {
        const normalized = normalize(label);
        const partial = targets.find((entry) => entry.text.includes(normalized));
        if (partial) {
          (partial.node as HTMLElement).click();
          return true;
        }
      }

      return false;
    }, { labels: variants }).catch(() => false);
  }

  private static async selectMicrosoftIndexedCombobox(page: Page, selector: string, value: string) {
    const normalized = this.normalizeText(value);
    let numeric = /^\d+$/.test(value) ? parseInt(value, 10) : NaN;
    if (!Number.isFinite(numeric)) {
      const monthsEn = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const monthsEs = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const monthIndex = [...monthsEn, ...monthsEs].findIndex((entry) => entry === normalized);
      if (monthIndex >= 0) {
        numeric = (monthIndex % 12) + 1;
      }
    }
    if (!Number.isFinite(numeric) || numeric < 1) return false;

    await page.click(selector).catch(() => {});
    await page.waitForTimeout(250);
    await page.keyboard.press('Home').catch(() => {});
    await page.waitForTimeout(80);
    const placeholderOffset = selector.includes('BirthMonthDropdown') ? 1 : 0;
    const moves = Math.max(0, numeric - 1 + placeholderOffset);
    for (let i = 0; i < moves; i++) {
      await page.keyboard.press('ArrowDown').catch(() => {});
      await page.waitForTimeout(100);
    }
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(250);
    return await this.didControlReflectValue(page, selector, value);
  }

  static async clearAndTypeVerified(page: Page, selector: string, value: string, options?: { numeric?: boolean }) {
    const desired = (value || '').toString();
    const numeric = !!options?.numeric;

    for (let attempt = 0; attempt < 3; attempt++) {
      await page.focus(selector).catch(() => {});
      await page.click(selector, { clickCount: 3 }).catch(() => {});
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.press('Backspace').catch(() => {});
      await page.fill(selector, '').catch(() => {});
      await page.waitForTimeout(120);

      await page.fill(selector, desired, { force: numeric }).catch(() => {});

      const finalValue = await page.$eval(selector, (el: any) => (el.value ?? '').toString()).catch(() => '');
      if (finalValue === desired) return finalValue;

      const forcedValue = await this.forceSetInputValue(page, selector, desired);
      if (forcedValue === desired) return forcedValue;

      await page.waitForTimeout(200 + attempt * 150);
    }

    const lastValue = await page.$eval(selector, (el: any) => (el.value ?? '').toString()).catch(() => '');
    throw new Error(`Verified typing failed for ${selector}: expected "${desired}" got "${lastValue}"`);
  }

  static async selectFromMixedControl(page: Page, selector: string, value: string) {
    const val = value.toString();
    const element = await page.$(selector);
    const tagName = await element?.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
    const role = await element?.getAttribute('role').catch(() => '');

    if (tagName === 'select') {
      await page.selectOption(selector, { label: val }).catch(async () => {
        await page.selectOption(selector, { value: val }).catch(async () => {
          await page.selectOption(selector, val).catch(() => {});
        });
      });
      await page.waitForTimeout(200);
      if (await this.didControlReflectValue(page, selector, val)) return;
      throw new Error(`Verified select failed for ${selector}: expected "${val}"`);
    }

    if (tagName === 'input') {
      await this.clearAndTypeVerified(page, selector, val, { numeric: /^\d+$/.test(val) });
      if (await this.didControlReflectValue(page, selector, val)) return;
      throw new Error(`Verified input selection failed for ${selector}: expected "${val}"`);
    }

    logger.info(`[SMART-SELECT] Mixed control detected at ${selector} (tag=${tagName || 'unknown'}, role=${role || 'unknown'}).`);
    const optionTexts = this.buildSelectionVariants(val);

    for (let attempt = 0; attempt < 3; attempt++) {
      await page.click(selector).catch(() => {});
      await page.waitForTimeout(350 + attempt * 100);

      if (await this.clickVisibleOptionViaDom(page, optionTexts)) {
        await page.waitForTimeout(250);
        if (await this.didControlReflectValue(page, selector, val)) {
          return;
        }
      }

      for (const text of optionTexts) {
        const optionLocators = [
          page.locator('[role="option"]').filter({ hasText: text }).first(),
          page.locator('[role="listbox"] *').filter({ hasText: text }).first(),
          page.locator('li').filter({ hasText: text }).first(),
          page.locator('button').filter({ hasText: text }).first(),
        ];

        for (const option of optionLocators) {
          const count = await option.count().catch(() => 0);
          if (count > 0) {
            await option.click().catch(() => {});
            await page.waitForTimeout(250);
            if (await this.didControlReflectValue(page, selector, val)) {
              return;
            }
          }
        }
      }

      if ((selector.includes('BirthDayDropdown') || selector.includes('BirthMonthDropdown')) && await this.selectMicrosoftIndexedCombobox(page, selector, val)) {
        return;
      }

      if (selector.includes('countryDropdownId')) {
        await page.keyboard.type(val, { delay: 50 }).catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        await page.waitForTimeout(250);
        if (await this.didControlReflectValue(page, selector, val)) {
          return;
        }
      }

      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.type(val, { delay: 50 }).catch(() => {});
      await page.keyboard.press('Enter').catch(() => {});
      await page.waitForTimeout(250);
      if (await this.didControlReflectValue(page, selector, val)) {
        return;
      }
    }

    throw new Error(`Verified mixed control selection failed for ${selector}: expected "${val}"`);
  }
}

import { Page } from 'playwright';
import { BrowserPolicyService, ExpectedField } from './browserPolicy.service';

export class BrowserSelectorService {
  private static readonly FIELD_SPECIFIC_BIRTH_SELECTORS: Record<ExpectedField, string[]> = {
    generic: [],
    birth: ['#BirthMonthDropdown', '#BirthDayDropdown', 'input[name="BirthYear"]', '#countryDropdownId'],
    month: ['#BirthMonthDropdown', 'button[name="BirthMonth"]', '#BirthMonth', 'select[name="BirthMonth"]', '[aria-label*="Month"]', '[aria-label*="Mes"]'],
    day: ['#BirthDayDropdown', 'button[name="BirthDay"]', '#BirthDay', 'select[name="BirthDay"]', 'input[name="BirthDay"]', '[aria-label*="Day"]', '[aria-label*="Dia"]', '[aria-label*="Día"]'],
    year: ['input[name="BirthYear"]', '#BirthYear', '#floatingLabelInput39', '#floatingLabelInput40', '[aria-label*="Year"]', '[aria-label*="Ano"]', '[aria-label*="Año"]'],
    country: ['#countryDropdownId', 'button[name="countryDropdownName"]', '#Country', 'select[name="Country"]', 'select[name*="Country"]', '[aria-label*="Country"]', '[aria-label*="Pais"]', '[aria-label*="País"]']
  };

  private static readonly SELECTOR_WATERFALL: Record<string, string[]> = {
    email: ['#MemberName', 'input[name="loginfmt"]', '#i0117', 'input[type="email"]', '[placeholder*="Email"]'],
    password: ['#Password', 'input[name="passwd"]', '#i0118', 'input[type="password"]', '[placeholder*="Password"]'],
    next: ['#SignupButton', '#idSIButton9', 'button:has-text("Siguiente")', 'button:has-text("Next")', '[type="submit"]'],
    last_name: ['#LastName', '#lastNameInput', 'input[name="LastName"]', 'input[name="lastNameInput"]', '[placeholder*="Apellido"]', '[aria-label*="Last"]'],
    birth: [
      '#BirthMonthDropdown',
      '#BirthDayDropdown',
      '#countryDropdownId',
      'button[name="BirthMonth"]',
      'button[name="BirthDay"]',
      'button[name="countryDropdownName"]',
      '#BirthMonth',
      '#BirthDay',
      '#BirthYear',
      'select[name="BirthMonth"]',
      'input[name="BirthDay"]',
      'input[name="BirthYear"]',
      '[placeholder*="Dia"]',
      '[placeholder*="Día"]',
      '[placeholder*="Ano"]',
      '[placeholder*="Año"]',
      '[aria-label*="Month"]',
      '[aria-label*="Day"]',
      '[aria-label*="Year"]',
      '[aria-label*="Birth"]',
      'select[name*="Month"]',
      'select[name*="Day"]',
      'select[name*="Year"]',
      '#Country',
      'select[name="BirthDay"]',
      'select[name="Country"]',
      'input[name="Country"]',
      '[placeholder*="Mes"]',
      '[placeholder*="Pais"]',
      '[placeholder*="País"]',
      '[aria-label*="Mes"]',
      '[aria-label*="Dia"]',
      '[aria-label*="Día"]',
      '[aria-label*="Ano"]',
      '[aria-label*="Año"]',
      '[aria-label*="Pais"]',
      '[aria-label*="País"]',
      'select[name*="Country"]',
      '[role="combobox"]'
    ]
  };

  static getFallbackSelectors(primarySelector: string) {
    const lowSel = (primarySelector || '').toLowerCase();
    const fallbacks: string[] = [primarySelector];
    if (lowSel.includes('member') || lowSel.includes('login') || lowSel.includes('email')) {
      fallbacks.push(...(this.SELECTOR_WATERFALL.email || []), '#i0117', 'input[name="loginfmt"]');
    } else if (lowSel.includes('pass')) {
      fallbacks.push(...(this.SELECTOR_WATERFALL.password || []), '#i0118', 'input[name="passwd"]', '#i0116');
    } else if (lowSel.includes('name')) {
      fallbacks.push(
        ...(this.SELECTOR_WATERFALL.last_name || []),
        '#FirstName',
        '#firstNameInput',
        '#LastName',
        '#lastNameInput',
        'input[name="FirstName"]',
        'input[name="firstNameInput"]',
        'input[name="LastName"]',
        'input[name="lastNameInput"]',
        '[aria-label*="First"]',
        '[aria-label*="Last"]'
      );
    } else if (lowSel.includes('birth') || lowSel.includes('month') || lowSel.includes('year') || lowSel.includes('day') || lowSel.includes('country')) {
      const expectedField = BrowserPolicyService.inferExpectedField(primarySelector);
      fallbacks.push(...(this.FIELD_SPECIFIC_BIRTH_SELECTORS[expectedField] || []));
      fallbacks.push(...(this.SELECTOR_WATERFALL.birth || []));
    } else if (lowSel.includes('button') || lowSel.includes('submit') || lowSel.includes('signup') || lowSel.includes('next')) {
      fallbacks.push(...(this.SELECTOR_WATERFALL.next || []));
    }
    return Array.from(new Set(fallbacks));
  }

  static async inferSemanticFieldSelector(page: Page, expected: ExpectedField): Promise<string | null> {
    if (expected === 'generic') return null;

    return await page.evaluate((fieldKind) => {
      const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
      const isVisible = (el: Element | null) => {
        if (!el) return false;
        const node = el as HTMLElement;
        const style = window.getComputedStyle(node);
        return style.visibility !== 'hidden' && style.display !== 'none' && node.offsetWidth > 0 && node.offsetHeight > 0;
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
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);

      return candidates[0]?.selector || null;
    }, expected).catch(() => null);
  }

  static async detectCompoundEmailDomainSelector(page: Page, inputSelector: string): Promise<string | null> {
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

      const containerCandidates: Element[] = [];
      let cursor: Element | null = input.parentElement;
      for (let depth = 0; cursor && depth < 4; depth += 1) {
        containerCandidates.push(cursor);
        cursor = cursor.parentElement;
      }

      const fallbackContainer = containerCandidates[0] || document.body;
      const searchRoots = [...containerCandidates, fallbackContainer];

      for (const root of searchRoots) {
        const nodes = Array.from(root.querySelectorAll('select, [role="combobox"], button, input[list]'));
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

          if ((node as HTMLElement).id) return `#${(node as HTMLElement).id}`;
          if (node.getAttribute('name')) return `${tag}[name="${node.getAttribute('name')}"]`;
          if (node.getAttribute('aria-label')) return `[aria-label*="${node.getAttribute('aria-label')!.slice(0, 20)}"]`;
          if (role) return `[role="${role}"]`;
          return tag;
        }
      }

      return null;
    }, inputSelector).catch(() => null);
  }
}
